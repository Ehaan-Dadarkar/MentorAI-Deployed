const express = require("express");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { callOpenRouter } = require("../services/ai");
const Quiz = require("../models/Quiz");
const User = require("../models/User");
const StudySession = require("../models/StudySession");
const Deck = require("../models/Deck");
const Flashcard = require("../models/Flashcard");

const router = express.Router();

const QUIZ_CACHE_TTL_MS = 1000 * 60 * 30;
const quizGenerationCache = new Map();

function normalizeSubject(subject) {
  return String(subject || "General").trim();
}

function contentFingerprint(content) {
  const value = String(content || "").trim();
  if (!value) return "";
  const head = value.slice(0, 120);
  const tail = value.slice(-120);
  return `${value.length}:${head}:${tail}`;
}

function buildCacheKey({ subject, topic, difficulty, count, content }) {
  return JSON.stringify({
    subject: normalizeSubject(subject).toLowerCase(),
    topic: String(topic || "").trim().toLowerCase(),
    difficulty,
    count,
    content: contentFingerprint(content),
  });
}

function readCachedQuiz(key) {
  const cached = quizGenerationCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    quizGenerationCache.delete(key);
    return null;
  }
  return cached.questions;
}

function writeCachedQuiz(key, questions) {
  quizGenerationCache.set(key, {
    questions,
    expiresAt: Date.now() + QUIZ_CACHE_TTL_MS,
  });
}

function parseQuestionsFromModel(rawText) {
  const coerceQuestion = (q) => {
    const options = Array.isArray(q.options)
      ? q.options.map((o) => String(o || "").trim()).slice(0, 4)
      : [];

    if (options.length !== 4) {
      throw new Error("Question must include exactly 4 options");
    }

    const question = String(q.question || "").trim();
    const explanation = String(q.explanation || "").trim();
    const concept = String(q.concept || q.topic || "General").trim();
    const rawIndex = Number.isInteger(q.correctIndex)
      ? q.correctIndex
      : q.correctAnswer;
    const correctIndex = Number(rawIndex);

    if (!question) throw new Error("Question text missing");
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error("correctIndex must be 0-3");
    }

    return {
      question,
      options,
      correctIndex,
      explanation: explanation || "No explanation provided.",
      concept,
    };
  };

  const parseArray = (value) => {
    if (Array.isArray(value)) return value.map(coerceQuestion);
    if (Array.isArray(value?.questions)) return value.questions.map(coerceQuestion);
    return null;
  };

  try {
    const parsed = JSON.parse(rawText);
    const asArray = parseArray(parsed);
    if (asArray) return asArray;
  } catch {
    // extraction attempt below
  }

  const match = rawText.match(/\[[\s\S]*\]/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    const asArray = parseArray(parsed);
    if (asArray) return asArray;
  }

  throw new Error("Failed to parse quiz JSON array from model response");
}

function buildQuizPrompt({ subject, topic, count, difficulty, content, strict }) {
  const topicSuffix = topic ? ` specifically about ${topic}` : "";
  const strictLine = strict
    ? "Return ONLY a strict JSON array. Do not include markdown, headings, or commentary."
    : "Return ONLY valid JSON array.";
  const hasContent = Boolean(String(content || "").trim());
  const sourceInstruction = hasContent
    ? "Use ONLY the provided study material as the knowledge source. Do not invent facts outside the source."
    : "Use accurate domain knowledge for the subject.";

  return [
    {
      role: "system",
      content: `You are an expert university quiz generator.
Generate ${count} multiple choice questions about ${subject}${topicSuffix}.
Difficulty: ${difficulty}.
Requirements:
- Each question tests conceptual understanding, not just recall
- Wrong options should be plausible, not obviously wrong
- Explanations should teach, not just confirm the answer
- ${sourceInstruction}
${strictLine}
Format:
[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correctIndex": 0,
    "explanation": "string",
    "concept": "string"
  }
]`,
    },
    {
      role: "user",
      content: hasContent
        ? `Generate exactly ${count} questions from this study material. Subject: ${subject}${topic ? `, topic: ${topic}` : ""}.\n\nStudy material:\n${String(content).trim()}`
        : `Generate exactly ${count} questions for subject: ${subject}${topic ? `, topic: ${topic}` : ""}.`,
    },
  ];
}

async function generateQuestionsWithRetry({
  subject,
  topic,
  count,
  difficulty,
  content,
  apiKey,
}) {
  const firstPrompt = buildQuizPrompt({
    subject,
    topic,
    count,
    difficulty,
    content,
    strict: false,
  });

  const first = await callOpenRouter(firstPrompt, { temperature: 0.4, apiKey });
  try {
    return parseQuestionsFromModel(first);
  } catch {
    const secondPrompt = buildQuizPrompt({
      subject,
      topic,
      count,
      difficulty,
      content,
      strict: true,
    });
    const second = await callOpenRouter(secondPrompt, { temperature: 0.2, apiKey });
    return parseQuestionsFromModel(second);
  }
}

function computeResults(questions, answers) {
  let correctCount = 0;
  const weakSet = new Set();

  const questionResults = questions.map((question, idx) => {
    const selected = Number.isInteger(answers[idx]) ? answers[idx] : -1;
    const isCorrect = selected === question.correctIndex;

    if (isCorrect) {
      correctCount += 1;
    } else {
      weakSet.add(question.concept || "General");
    }

    return {
      question: question.question,
      selectedIndex: selected,
      correctIndex: question.correctIndex,
      isCorrect,
      explanation: question.explanation,
      concept: question.concept,
      options: question.options,
    };
  });

  const score = questions.length
    ? Math.round((correctCount / questions.length) * 100)
    : 0;

  return {
    score,
    correctCount,
    weakTopics: Array.from(weakSet),
    questionResults,
  };
}

async function persistQuizAndSession({
  userId,
  subject,
  deckName,
  deckId,
  existingQuizId,
  questions,
  answers,
  timeTaken,
}) {
  const normalizedQuestions = questions.map((q, idx) => ({
    question: q.question,
    options: q.options,
    correctAnswer: q.correctIndex,
    userAnswer: Number.isInteger(answers[idx]) ? answers[idx] : -1,
    explanation: q.explanation,
    topic: q.concept,
  }));

  const computed = computeResults(questions, answers);

  const normalizedSubject = normalizeSubject(subject);
  const normalizedDeckName = String(deckName || "").trim();

  let quiz;
  if (existingQuizId) {
    quiz = await Quiz.findOneAndUpdate(
      { _id: existingQuizId, userId },
      {
        subject: normalizedSubject,
        questions: normalizedQuestions,
        score: computed.score,
        timeTaken,
        weakTopics: computed.weakTopics,
        completedAt: new Date(),
        ...(normalizedDeckName ? { deckName: normalizedDeckName } : {}),
        ...(deckId ? { deckId } : {}),
      },
      { new: true },
    );

    if (!quiz) {
      const error = new Error("Quiz not found");
      error.status = 404;
      throw error;
    }
  } else {
    quiz = await Quiz.create({
      userId,
      subject: normalizedSubject,
      deckName: normalizedDeckName,
      deckId: deckId || null,
      questions: normalizedQuestions,
      score: computed.score,
      timeTaken,
      weakTopics: computed.weakTopics,
      completedAt: new Date(),
    });
  }

  if (computed.weakTopics.length > 0) {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { weakTopics: { $each: computed.weakTopics } },
    });
  }

  await StudySession.create({
    userId,
    type: "quiz",
    subject: normalizedSubject,
    durationMinutes: Math.max(0, Math.round((Number(timeTaken) || 0) / 60)),
  });

  return { quiz, ...computed };
}

async function createQuizDeckFromQuestions({
  userId,
  subject,
  deckName,
  questions,
  difficulty,
}) {
  const normalizedSubject = normalizeSubject(subject);
  const normalizedDeckName = String(deckName || "").trim() || `${normalizedSubject} Quiz Deck`;

  const deck = await Deck.create({
    userId,
    name: normalizedDeckName,
    subject: normalizedSubject,
  });

  const flashcards = questions.map((q) => {
    const correct = q.options[q.correctIndex] || "";
    const explanation = String(q.explanation || "").trim();
    const answer = explanation
      ? `Correct answer: ${correct}\n\nExplanation: ${explanation}`
      : `Correct answer: ${correct}`;

    return {
      deckId: deck._id,
      userId,
      question: q.question,
      answer,
      difficulty,
    };
  });

  await Flashcard.insertMany(flashcards);

  return deck;
}

// POST /api/quiz/generate
const generateSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().optional(),
  count: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  content: z.string().min(10).optional(),
  deckName: z.string().min(1).max(200).optional(),
  createFlashcardDeck: z.boolean().optional().default(false),
});

router.post(
  "/generate",
  auth,
  dynamicAiLimiter,
  validate(generateSchema),
  async (req, res, next) => {
    try {
      const {
        subject,
        topic,
        count,
        difficulty,
        content,
        deckName,
        createFlashcardDeck,
      } = req.body;
      const normalizedSubject = normalizeSubject(subject);
      const cacheKey = buildCacheKey({
        subject,
        topic,
        difficulty,
        count,
        content,
      });

      let questions = readCachedQuiz(cacheKey);
      if (!questions) {
        questions = await generateQuestionsWithRetry({
          subject,
          topic,
          count,
          difficulty,
          content,
          apiKey: req.user?.openrouterApiKey,
        });
        writeCachedQuiz(cacheKey, questions);
      }

      let deck = null;
      if (createFlashcardDeck === true) {
        deck = await createQuizDeckFromQuestions({
          userId: req.userId,
          subject: normalizedSubject,
          deckName,
          questions,
          difficulty,
        });
      }

      const normalizedDeckName =
        String(deckName || "").trim() || deck?.name || `${normalizedSubject} Quiz Deck`;

      const quiz = await Quiz.create({
        userId: req.userId,
        subject: normalizedSubject,
        deckName: normalizedDeckName,
        ...(deck ? { deckId: deck._id } : {}),
        questions: questions.map((q) => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctIndex,
          explanation: q.explanation,
          topic: q.concept,
        })),
      });

      res.status(201).json({
        quiz,
        questions,
        deck,
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/quiz/submit
const submitSchema = z.object({
  quizId: z.string().optional(),
  deckName: z.string().optional(),
  deckId: z.string().optional(),
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().optional().default(""),
        concept: z.string().optional().default("General"),
      }),
    )
    .min(1),
  answers: z.array(z.number().int().min(-1).max(3)).min(1),
  timeTaken: z.number().min(0),
  subject: z.string().optional(),
});

router.post(
  "/submit",
  auth,
  validate(submitSchema),
  async (req, res, next) => {
    try {
      const { questions, answers, timeTaken, subject, quizId, deckName, deckId } = req.body;
      const result = await persistQuizAndSession({
        userId: req.userId,
        subject: subject || "General",
        deckName,
        deckId,
        existingQuizId: quizId,
        questions,
        answers,
        timeTaken,
      });

      res.json({
        score: result.score,
        correctCount: result.correctCount,
        weakTopics: result.weakTopics,
        questionResults: result.questionResults,
        quiz: result.quiz,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Legacy POST /api/quiz/:id/submit (compat)
const legacySubmitSchema = z.object({
  answers: z.array(z.number().int().min(-1).max(3)).min(1),
  timeTaken: z.number().min(0),
});

router.post(
  "/:id/submit",
  auth,
  validate(legacySubmitSchema),
  async (req, res, next) => {
    try {
      const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.userId });
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      if (quiz.completedAt) {
        return res.status(400).json({ error: "Quiz already submitted" });
      }

      const normalizedQuestions = quiz.questions.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctAnswer,
        explanation: q.explanation || "",
        concept: q.topic || "General",
      }));

      const result = await persistQuizAndSession({
        userId: req.userId,
        subject: quiz.subject || "General",
        deckName: quiz.deckName,
        deckId: quiz.deckId,
        existingQuizId: quiz._id,
        questions: normalizedQuestions,
        answers: req.body.answers,
        timeTaken: req.body.timeTaken,
      });

      res.json({
        score: result.score,
        correctCount: result.correctCount,
        weakTopics: result.weakTopics,
        questionResults: result.questionResults,
        quiz: result.quiz,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/quiz/history — past 10 quizzes
router.get("/history", auth, async (req, res, next) => {
  try {
    const quizzes = await Quiz.find({ userId: req.userId, completedAt: { $ne: null } })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(10);

    res.json({ quizzes });
  } catch (error) {
    next(error);
  }
});

// GET /api/quiz/stats — accuracy by subject
router.get("/stats", auth, async (req, res, next) => {
  try {
    const stats = await Quiz.aggregate([
      {
        $match: {
          userId: req.userId,
          completedAt: { $ne: null },
          score: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$subject",
          attempts: { $sum: 1 },
          avgAccuracy: { $avg: "$score" },
          bestScore: { $max: "$score" },
          latestCompletedAt: { $max: "$completedAt" },
        },
      },
      { $sort: { avgAccuracy: -1 } },
    ]);

    res.json({
      stats: stats.map((row) => ({
        subject: row._id || "General",
        attempts: row.attempts,
        avgAccuracy: Math.round(row.avgAccuracy || 0),
        bestScore: row.bestScore || 0,
        latestCompletedAt: row.latestCompletedAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Legacy GET /api/quiz — list quizzes (compat)
router.get("/", auth, async (req, res, next) => {
  try {
    const quizzes = await Quiz.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-questions.explanation");

    res.json({ quizzes });
  } catch (error) {
    next(error);
  }
});

// Legacy GET /api/quiz/:id (compat)
router.get("/:id", auth, async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.userId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    res.json({ quiz });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/quiz/:id — delete a quiz deck entry
router.delete("/:id", auth, async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.userId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    let deletedCount = 0;

    if (quiz.deckId) {
      const result = await Quiz.deleteMany({
        userId: req.userId,
        deckId: quiz.deckId,
      });
      deletedCount = result.deletedCount || 0;
    } else {
      const result = await Quiz.deleteOne({ _id: quiz._id, userId: req.userId });
      deletedCount = result.deletedCount || 0;
    }

    res.json({ deleted: true, deletedCount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
