const express = require("express");
const auth = require("../middleware/auth");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { callOpenRouter } = require("../services/ai");
const Quiz = require("../models/Quiz");
const VoiceSession = require("../models/VoiceSession");
const Deck = require("../models/Deck");
const Flashcard = require("../models/Flashcard");
const Note = require("../models/Note");

const router = express.Router();

const GRAPH_CACHE_TTL_MS = 1000 * 60 * 5;
const MAX_NOTES_FETCH = 120;
const MAX_QUIZZES_FETCH = 240;
const MAX_VOICE_FETCH = 240;
const MAX_FLASHCARDS_FETCH = 4000;
const MAX_CONCEPTS_PER_NOTE = 10;
const MAX_QUIZZES_PER_NOTE = 3;
const MAX_DECKS_PER_NOTE = 2;
const MAX_VOICE_PER_NOTE = 3;
const MAX_TOTAL_NODES = 460;

const graphCache = new Map();

const NOISE_TERMS = new Set([
  "general",
  "topic",
  "topics",
  "concept",
  "concepts",
  "note",
  "notes",
  "section",
  "sections",
  "study",
  "learning",
  "introduction",
  "summary",
  "overview",
  "chapter",
  "lecture",
  "question",
  "answer",
]);

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "among",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "first",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "other",
  "over",
  "some",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "using",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "your",
]);

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function normalizeSubject(subject) {
  const normalized = normalizeWhitespace(subject || "General");
  return normalized || "General";
}

function subjectKey(subject) {
  return normalizeSubject(subject).toLowerCase();
}

function normalizeConceptKey(value) {
  const cleaned = normalizeWhitespace(stripHtml(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#\s-]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) return "";
  if (NOISE_TERMS.has(cleaned)) return "";
  return cleaned;
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function readCache(cacheKey) {
  const cached = graphCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    graphCache.delete(cacheKey);
    return null;
  }
  return cached.payload;
}

function writeCache(cacheKey, payload) {
  graphCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + GRAPH_CACHE_TTL_MS,
  });
}

function parseAiJson(raw) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Continue to extraction path.
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // Continue to array extraction.
    }
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return { edges: JSON.parse(arrayMatch[0]) };
    } catch {
      return null;
    }
  }

  return null;
}

function extractKeywordConcepts(text, max = 8) {
  const tokens = stripHtml(text)
    .toLowerCase()
    .match(/[a-z][a-z0-9+#-]{3,}/g);

  if (!tokens) return [];

  const frequency = new Map();
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || NOISE_TERMS.has(token)) continue;
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([token]) => toTitleCase(token));
}

function extractConceptsFromNote(note) {
  const collected = [];

  for (const term of note.keyTerms || []) {
    if (term?.term) collected.push(term.term);
  }

  for (const section of note.sections || []) {
    if (section?.heading) collected.push(section.heading);
  }

  for (const tag of note.tags || []) {
    if (tag) collected.push(tag);
  }

  if (collected.length < 4) {
    const fallback = extractKeywordConcepts(
      `${note.summary || ""} ${note.content || ""}`,
      8,
    );
    collected.push(...fallback);
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of collected) {
    const key = normalizeConceptKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ key, label: normalizeWhitespace(stripHtml(entry)) || toTitleCase(key) });
    if (deduped.length >= MAX_CONCEPTS_PER_NOTE) break;
  }

  return deduped;
}

function registerConceptSignal(conceptSignals, concept, subject, signal = {}) {
  const key = normalizeConceptKey(concept);
  if (!key) return null;

  const entry = conceptSignals.get(key) || {
    id: key,
    label: normalizeWhitespace(stripHtml(concept)) || toTitleCase(key),
    subjectCounts: new Map(),
    quizTotal: 0,
    quizCount: 0,
    flashTotal: 0,
    flashCount: 0,
    voiceTotal: 0,
    voiceCount: 0,
    weakHits: 0,
    occurrences: 0,
    fromNote: false,
  };

  const labelCandidate = normalizeWhitespace(stripHtml(concept));
  if (labelCandidate && labelCandidate.length > entry.label.length) {
    entry.label = labelCandidate;
  }

  const normalizedSubject = normalizeSubject(subject);
  entry.subjectCounts.set(
    normalizedSubject,
    (entry.subjectCounts.get(normalizedSubject) || 0) + 1,
  );

  if (Number.isFinite(signal.quizScore)) {
    entry.quizTotal += Number(signal.quizScore);
    entry.quizCount += 1;
  }
  if (Number.isFinite(signal.flashMastery)) {
    entry.flashTotal += Number(signal.flashMastery);
    entry.flashCount += 1;
  }
  if (Number.isFinite(signal.voiceScore)) {
    entry.voiceTotal += Number(signal.voiceScore);
    entry.voiceCount += 1;
  }

  entry.weakHits += Number(signal.weakHit) || 0;
  entry.occurrences += Number(signal.occurrenceWeight) || 1;
  if (signal.fromNote) entry.fromNote = true;

  conceptSignals.set(key, entry);
  return entry;
}

function pickPrimarySubject(subjectCounts) {
  let winner = "General";
  let maxCount = 0;

  for (const [subject, count] of subjectCounts.entries()) {
    if (count > maxCount) {
      winner = subject;
      maxCount = count;
    }
  }

  return winner;
}

function computeMastery(signal, base = 55) {
  let mastery = base;

  if (signal.quizCount > 0) {
    mastery = mastery * 0.4 + (signal.quizTotal / signal.quizCount) * 0.6;
  }

  if (signal.flashCount > 0) {
    mastery = mastery * 0.65 + (signal.flashTotal / signal.flashCount) * 0.35;
  }

  if (signal.voiceCount > 0) {
    mastery = mastery * 0.7 + (signal.voiceTotal / signal.voiceCount) * 0.3;
  }

  if (signal.weakHits > 0) {
    mastery -= Math.min(30, signal.weakHits * 7);
  }

  return clamp(Math.round(mastery), 0, 100);
}

function quizMatchesNote(quiz, note) {
  const subjectMatch = subjectKey(quiz.subject) === subjectKey(note.subject);
  if (subjectMatch) return true;

  const title = normalizeWhitespace(note.title).toLowerCase();
  if (title.length < 6) return false;

  return normalizeWhitespace(quiz.deckName || "")
    .toLowerCase()
    .includes(title);
}

function deckMatchesNote(deck, note) {
  const subjectMatch = subjectKey(deck.subject) === subjectKey(note.subject);
  if (subjectMatch) return true;

  const title = normalizeWhitespace(note.title).toLowerCase();
  if (title.length < 6) return false;

  return normalizeWhitespace(deck.name || "")
    .toLowerCase()
    .includes(title);
}

function buildDeckStats(decks, flashcards) {
  const deckMap = new Map();

  for (const deck of decks) {
    deckMap.set(String(deck._id), {
      deck,
      masteryTotal: 0,
      cardCount: 0,
      conceptFreq: new Map(),
      latestActivity: deck.updatedAt || deck.createdAt || Date.now(),
    });
  }

  for (const card of flashcards) {
    const deckId = String(card.deckId || "");
    const state = deckMap.get(deckId);
    if (!state) continue;

    state.masteryTotal += Number(card.mastery) || 0;
    state.cardCount += 1;

    const concepts = extractKeywordConcepts(
      `${card.question || ""} ${card.answer || ""}`,
      4,
    );
    for (const concept of concepts) {
      const key = normalizeConceptKey(concept);
      if (!key) continue;
      state.conceptFreq.set(key, (state.conceptFreq.get(key) || 0) + 1);
    }

    if (card.updatedAt && new Date(card.updatedAt).getTime() > new Date(state.latestActivity).getTime()) {
      state.latestActivity = card.updatedAt;
    }
  }

  const result = new Map();
  for (const [deckId, state] of deckMap.entries()) {
    const avgMastery = state.cardCount > 0 ? state.masteryTotal / state.cardCount : 0;
    const concepts = Array.from(state.conceptFreq.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([key]) => toTitleCase(key));

    result.set(deckId, {
      ...state.deck,
      avgMastery,
      cardCount: state.cardCount,
      concepts,
      latestActivity: state.latestActivity,
    });
  }

  return result;
}

function edgeKey(source, target, type) {
  return `${source}::${target}::${type}`;
}

function addNode(nodeMap, node) {
  if (!nodeMap.has(node.id)) {
    nodeMap.set(node.id, node);
    return;
  }

  const existing = nodeMap.get(node.id);
  existing.frequency = Math.max(existing.frequency, node.frequency);
  existing.mastery = Math.round((existing.mastery + node.mastery) / 2);
}

function addEdge(edges, edgeSet, edge) {
  const key = edgeKey(edge.source, edge.target, edge.type);
  if (edgeSet.has(key)) return;
  edgeSet.add(key);
  edges.push(edge);
}

async function generateAiConceptLinks(conceptNodes, apiKey) {
  if (!apiKey) {
    return { edges: [], usedAI: false };
  }

  const candidates = conceptNodes.slice(0, 80);
  if (candidates.length < 4) {
    return { edges: [], usedAI: false };
  }

  const conceptMap = new Map();
  for (const node of candidates) {
    conceptMap.set(normalizeConceptKey(node.label), node.id);
  }

  const messages = [
    {
      role: "system",
      content: `Given these concepts:
{concepts}

Return ONLY strong conceptual relationships.

{
  "edges": [
    { "source": "string", "target": "string", "relationship": "string" }
  ]
}

Rules:
- Only meaningful learning relationships
- Prefer: "prerequisite of", "builds on", "applied in"
- Max 2 connections per concept
- Avoid generic links like "related to"`,
    },
    {
      role: "user",
      content: JSON.stringify({
        concepts: candidates.map((node) => node.label),
      }),
    },
  ];

  const raw = await callOpenRouter(messages, {
    temperature: 0.2,
    maxTokens: 900,
    apiKey,
  });

  const parsed = parseAiJson(raw);
  const sourceEdges = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.edges)
      ? parsed.edges
      : [];

  const edgeDedupe = new Set();
  const perConceptCount = new Map();
  const edges = [];

  for (const rawEdge of sourceEdges) {
    const sourceId = conceptMap.get(normalizeConceptKey(rawEdge?.source || ""));
    const targetId = conceptMap.get(normalizeConceptKey(rawEdge?.target || ""));
    if (!sourceId || !targetId || sourceId === targetId) continue;

    const relationship = normalizeWhitespace(rawEdge?.relationship || "").toLowerCase();
    if (!relationship || relationship.includes("related to")) continue;

    const pair = sourceId < targetId ? `${sourceId}::${targetId}` : `${targetId}::${sourceId}`;
    if (edgeDedupe.has(pair)) continue;

    const sourceCount = perConceptCount.get(sourceId) || 0;
    const targetCount = perConceptCount.get(targetId) || 0;
    if (sourceCount >= 2 || targetCount >= 2) continue;

    perConceptCount.set(sourceId, sourceCount + 1);
    perConceptCount.set(targetId, targetCount + 1);
    edgeDedupe.add(pair);

    edges.push({
      source: sourceId,
      target: targetId,
      type: "concept-link",
      relationship: relationship.slice(0, 90),
    });
  }

  return {
    edges,
    usedAI: edges.length > 0,
  };
}

function truncateGraph(nodes, edges) {
  if (nodes.length <= MAX_TOTAL_NODES) {
    return { nodes, edges, truncated: false };
  }

  const noteNodes = nodes
    .filter((node) => node.type === "note")
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 140);

  const remainingSlots = Math.max(0, MAX_TOTAL_NODES - noteNodes.length);
  const otherNodes = nodes
    .filter((node) => node.type !== "note")
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, remainingSlots);

  const selected = [...noteNodes, ...otherNodes];
  const selectedIds = new Set(selected.map((node) => node.id));
  const filteredEdges = edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );

  return {
    nodes: selected,
    edges: filteredEdges,
    truncated: true,
  };
}

async function buildNoteCentricGraph({ notes, quizzes, voiceSessions, deckStatsMap, useAi }) {
  const quizzesBySubject = new Map();
  const decksBySubject = new Map();
  const voicesByNote = new Map();
  const conceptSignals = new Map();
  const noteConceptsMap = new Map();

  for (const quiz of quizzes) {
    const key = subjectKey(quiz.subject);
    const list = quizzesBySubject.get(key) || [];
    list.push(quiz);
    quizzesBySubject.set(key, list);

    const score = Number.isFinite(quiz.score) ? Number(quiz.score) : 50;
    for (const weakTopic of quiz.weakTopics || []) {
      registerConceptSignal(conceptSignals, weakTopic, quiz.subject, {
        quizScore: score,
        weakHit: 1,
        occurrenceWeight: 1.2,
      });
    }

    for (const question of quiz.questions || []) {
      if (!question?.topic) continue;
      const isCorrect = question.userAnswer === question.correctAnswer;
      registerConceptSignal(conceptSignals, question.topic, quiz.subject, {
        quizScore: isCorrect ? 85 : 35,
        weakHit: isCorrect ? 0 : 1,
      });
    }
  }

  for (const deckState of deckStatsMap.values()) {
    const key = subjectKey(deckState.subject);
    const list = decksBySubject.get(key) || [];
    list.push(deckState);
    decksBySubject.set(key, list);

    for (const concept of deckState.concepts) {
      registerConceptSignal(conceptSignals, concept, deckState.subject, {
        flashMastery: deckState.avgMastery,
        occurrenceWeight: 1.1,
      });
    }
  }

  for (const session of voiceSessions) {
    const noteId = session.noteId ? String(session.noteId) : "";
    if (noteId) {
      const list = voicesByNote.get(noteId) || [];
      list.push(session);
      voicesByNote.set(noteId, list);
    }

    const voiceScore = Number.isFinite(session.avgScore) ? Number(session.avgScore) : 50;
    for (const weakConcept of session.weakConcepts || []) {
      registerConceptSignal(conceptSignals, weakConcept, session.subject, {
        voiceScore,
        weakHit: 1,
        occurrenceWeight: 1.2,
      });
    }

    for (const response of session.responses || []) {
      const score = Number.isFinite(response?.score) ? Number(response.score) : voiceScore;
      for (const concept of response?.expectedConcepts || []) {
        registerConceptSignal(conceptSignals, concept, session.subject, {
          voiceScore: score,
        });
      }
    }
  }

  for (const note of notes) {
    const noteId = String(note._id);
    const concepts = extractConceptsFromNote(note);
    noteConceptsMap.set(noteId, concepts);

    for (const concept of concepts) {
      registerConceptSignal(conceptSignals, concept.label, note.subject, {
        fromNote: true,
        occurrenceWeight: 1.3,
      });
    }
  }

  const nodeMap = new Map();
  const edges = [];
  const edgeSet = new Set();

  for (const note of notes) {
    const noteId = String(note._id);
    const normalizedSubject = normalizeSubject(note.subject);
    const currentConcepts = noteConceptsMap.get(noteId) || [];

    const matchedQuizzes = (quizzesBySubject.get(subjectKey(normalizedSubject)) || [])
      .filter((quiz) => quizMatchesNote(quiz, note))
      .slice(0, MAX_QUIZZES_PER_NOTE);

    const matchedDecks = (decksBySubject.get(subjectKey(normalizedSubject)) || [])
      .filter((deck) => deckMatchesNote(deck, note))
      .slice(0, MAX_DECKS_PER_NOTE);

    const matchedVoices = (voicesByNote.get(noteId) || []).slice(0, MAX_VOICE_PER_NOTE);

    const noteSignal = {
      quizTotal: 0,
      quizCount: 0,
      flashTotal: 0,
      flashCount: 0,
      voiceTotal: 0,
      voiceCount: 0,
      weakHits: 0,
    };

    for (const quiz of matchedQuizzes) {
      if (Number.isFinite(quiz.score)) {
        noteSignal.quizTotal += Number(quiz.score);
        noteSignal.quizCount += 1;
      }
    }

    for (const deck of matchedDecks) {
      if (Number.isFinite(deck.avgMastery)) {
        noteSignal.flashTotal += Number(deck.avgMastery);
        noteSignal.flashCount += 1;
      }
    }

    for (const session of matchedVoices) {
      if (Number.isFinite(session.avgScore)) {
        noteSignal.voiceTotal += Number(session.avgScore);
        noteSignal.voiceCount += 1;
      }
    }

    for (const concept of currentConcepts) {
      const signal = conceptSignals.get(concept.key);
      noteSignal.weakHits += signal?.weakHits || 0;
    }

    const noteMastery = computeMastery(noteSignal, 56);
    const noteFrequency = Math.max(
      1,
      currentConcepts.length + matchedQuizzes.length + matchedDecks.length + matchedVoices.length,
    );

    addNode(nodeMap, {
      id: noteId,
      label: normalizeWhitespace(note.title) || "Untitled Note",
      type: "note",
      subject: normalizedSubject,
      mastery: noteMastery,
      frequency: noteFrequency,
    });

    for (const concept of currentConcepts) {
      const signal = conceptSignals.get(concept.key);
      if (!signal) continue;
      if (!signal.fromNote) continue;

      addNode(nodeMap, {
        id: signal.id,
        label: signal.label,
        type: "concept",
        subject: pickPrimarySubject(signal.subjectCounts),
        mastery: computeMastery(signal, 60),
        frequency: Math.max(1, Math.round(signal.occurrences)),
      });

      addEdge(edges, edgeSet, {
        source: noteId,
        target: signal.id,
        type: "contains",
        relationship: "contains concept",
      });
    }

    for (const quiz of matchedQuizzes) {
      const resourceId = `quiz:${quiz._id}:note:${noteId}`;
      const mastery = clamp(
        (Number.isFinite(quiz.score) ? Number(quiz.score) : 55) - (quiz.weakTopics?.length || 0) * 4,
        0,
        100,
      );

      addNode(nodeMap, {
        id: resourceId,
        label: `Quiz: ${normalizeSubject(quiz.subject)}`,
        type: "quiz",
        subject: normalizeSubject(quiz.subject),
        mastery,
        frequency: Math.max(1, (quiz.questions || []).length),
        noteId,
      });

      addEdge(edges, edgeSet, {
        source: noteId,
        target: resourceId,
        type: "generated",
        relationship: "subject-aligned quiz",
      });
    }

    for (const deck of matchedDecks) {
      const resourceId = `flashcard:${deck._id}:note:${noteId}`;
      addNode(nodeMap, {
        id: resourceId,
        label: `Flashcards: ${normalizeWhitespace(deck.name) || "Deck"}`,
        type: "flashcard",
        subject: normalizeSubject(deck.subject),
        mastery: clamp(Math.round(deck.avgMastery || 0), 0, 100),
        frequency: Math.max(1, Number(deck.cardCount) || 0),
        noteId,
      });

      addEdge(edges, edgeSet, {
        source: noteId,
        target: resourceId,
        type: "generated",
        relationship: "subject-aligned flashcards",
      });
    }

    for (const session of matchedVoices) {
      const resourceId = `voice:${session._id}:note:${noteId}`;
      const mastery = clamp(
        (Number.isFinite(session.avgScore) ? Number(session.avgScore) : 50) -
          (session.weakConcepts?.length || 0) * 5,
        0,
        100,
      );

      addNode(nodeMap, {
        id: resourceId,
        label: `Voice Session: ${normalizeSubject(session.subject || note.subject)}`,
        type: "voice",
        subject: normalizeSubject(session.subject || note.subject),
        mastery,
        frequency: Math.max(1, (session.responses || []).length),
        noteId,
      });

      addEdge(edges, edgeSet, {
        source: noteId,
        target: resourceId,
        type: "practiced",
        relationship: "voice recall practice",
      });
    }
  }

  const nodes = Array.from(nodeMap.values());
  const conceptNodes = nodes.filter((node) => node.type === "concept");

  let usedAI = false;
  if (useAi && conceptNodes.length > 0) {
    try {
      const aiResult = await generateAiConceptLinks(
        conceptNodes,
        req.user?.openrouterApiKey || process.env.OPENROUTER_API_KEY,
      );
      usedAI = aiResult.usedAI;
      for (const aiEdge of aiResult.edges) {
        addEdge(edges, edgeSet, aiEdge);
      }
    } catch (error) {
      console.warn("Knowledge graph concept linking fallback:", error.message);
    }
  }

  const { nodes: trimmedNodes, edges: trimmedEdges, truncated } = truncateGraph(nodes, edges);

  return {
    nodes: trimmedNodes,
    edges: trimmedEdges,
    usedAI,
    truncated,
  };
}

router.get("/", auth, dynamicAiLimiter, async (req, res, next) => {
  try {
    const useAi = req.query.ai !== "false";
    const cacheKey = `${req.userId}:${useAi ? "ai" : "base"}:note-centric:v2`;
    const cached = readCache(cacheKey);
    if (cached) return res.json(cached);

    const [notes, quizzes, voiceSessions, decks, flashcards] = await Promise.all([
      Note.find({ userId: req.userId, isDeleted: { $ne: true } })
        .sort({ updatedAt: -1 })
        .limit(MAX_NOTES_FETCH)
        .select("title content summary sections keyTerms tags subject sourceType createdAt updatedAt")
        .lean(),
      Quiz.find({ userId: req.userId })
        .sort({ updatedAt: -1 })
        .limit(MAX_QUIZZES_FETCH)
        .select("subject deckName questions weakTopics score completedAt createdAt updatedAt")
        .lean(),
      VoiceSession.find({ userId: req.userId })
        .sort({ updatedAt: -1 })
        .limit(MAX_VOICE_FETCH)
        .select("noteId subject responses weakConcepts avgScore completedAt createdAt updatedAt")
        .lean(),
      Deck.find({ userId: req.userId })
        .select("name subject createdAt updatedAt")
        .lean(),
      Flashcard.find({ userId: req.userId })
        .sort({ updatedAt: -1 })
        .limit(MAX_FLASHCARDS_FETCH)
        .select("deckId mastery question answer updatedAt")
        .lean(),
    ]);

    const deckStatsMap = buildDeckStats(decks, flashcards);
    const graph = await buildNoteCentricGraph({
      notes,
      quizzes,
      voiceSessions,
      deckStatsMap,
      useAi,
    });

    const typeCounts = graph.nodes.reduce(
      (acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      },
      {
        note: 0,
        concept: 0,
        quiz: 0,
        flashcard: 0,
        voice: 0,
      },
    );

    const edgeCounts = graph.edges.reduce(
      (acc, edge) => {
        acc[edge.type] = (acc[edge.type] || 0) + 1;
        return acc;
      },
      {
        contains: 0,
        generated: 0,
        practiced: 0,
        "concept-link": 0,
      },
    );

    const payload = {
      success: true,
      nodes: graph.nodes,
      edges: graph.edges,
      meta: {
        generatedAt: new Date().toISOString(),
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        usedAI: graph.usedAI,
        truncated: graph.truncated,
        nodeTypes: typeCounts,
        edgeTypes: edgeCounts,
      },
    };

    writeCache(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
