// Ranked full-text notes search + tutor auto-retrieval (slice 159).
// The text index (stemmed, weighted title > tags > content) powers
// GET /api/notes/search and the tutor's automatic note context.
// Pure helpers are tested directly; Note.find / VoiceSession.find are
// stubbed to assert query shape (userId scoping, $text usage) without
// MongoDB. Fake notes only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const notesRouter = require("../routes/notes");
const tutorRouter = require("../routes/tutor");
const Note = require("../models/Note");
const VoiceSession = require("../models/VoiceSession");

const { extractSnippet, sanitizeTextQuery, retrieveNotePassages } = notesRouter;
const { buildAutoNoteContext, getRecentWeakConcepts, weakConceptsLine } = tutorRouter;

// ── pure helpers ──────────────────────────────────────────────

test("sanitizeTextQuery strips $text operator syntax", () => {
  assert.equal(sanitizeTextQuery('"exact phrase"'), "exact phrase");
  assert.equal(sanitizeTextQuery("  cell's  "), "cells");
  assert.equal(sanitizeTextQuery(""), "");
});

test("extractSnippet centers on the first term hit", () => {
  const content = "aaa ".repeat(200) + "mitochondria is the powerhouse" + " bbb".repeat(200);
  const snippet = extractSnippet(content, "mitochondria powerhouse");
  assert.match(snippet, /mitochondria is the powerhouse/);
  assert.ok(snippet.startsWith("…"));
  assert.ok(snippet.endsWith("…"));
  assert.ok(snippet.length < 700);
});

test("extractSnippet falls back to the opening when nothing matches", () => {
  const snippet = extractSnippet("hello world", "zzz");
  assert.equal(snippet, "hello world");
});

test("extractSnippet ignores short words", () => {
  const snippet = extractSnippet("the cat sat on the mat", "on the");
  assert.equal(snippet, "the cat sat on the mat");
});

test("weakConceptsLine is empty with no concepts", () => {
  assert.equal(weakConceptsLine([]), "");
  assert.equal(weakConceptsLine(null), "");
});

test("weakConceptsLine names the concepts without lecturing", () => {
  const line = weakConceptsLine(["mitosis", "pH"]);
  assert.match(line, /mitosis/);
  assert.match(line, /pH/);
  assert.match(line, /do not lecture/);
});

// ── retrieveNotePassages (stubbed Note.find) ──────────────────

function stubNoteFind(t, impl) {
  const original = Note.find;
  Note.find = impl;
  t.after(() => {
    Note.find = original;
  });
}

function chainable(result) {
  const chain = {};
  chain.sort = () => chain;
  chain.limit = () => chain;
  chain.select = () => chain;
  chain.maxTimeMS = () => chain;
  chain.lean = async () => result;
  return chain;
}

test("retrieveNotePassages returns [] for short queries without touching the DB", async (t) => {
  let called = false;
  stubNoteFind(t, () => {
    called = true;
    return chainable([]);
  });
  assert.deepEqual(await retrieveNotePassages("u1", "ab"), []);
  assert.equal(called, false);
});

test("retrieveNotePassages scopes by userId and uses $text with relevance sort", async (t) => {
  let seenFilter = null;
  let seenProjection = null;
  stubNoteFind(t, (filter, projection) => {
    seenFilter = filter;
    seenProjection = projection;
    return chainable([
      { _id: "n1", title: "Cell bio", content: "mitochondria facts here" },
    ]);
  });
  const out = await retrieveNotePassages("user-9", "mitochondria");
  assert.equal(seenFilter.userId, "user-9");
  assert.deepEqual(seenFilter.$text, { $search: "mitochondria" });
  assert.ok("score" in seenProjection);
  assert.equal(out.length, 1);
  assert.equal(out[0].noteId, "n1");
  assert.match(out[0].passage, /mitochondria/);
});

test("buildAutoNoteContext uses the last user message and formats passages", async (t) => {
  const original = notesRouter.retrieveNotePassages;
  notesRouter.retrieveNotePassages = async () => [
    { noteId: "n1", title: "T", passage: "passage text", score: 2 },
  ];
  t.after(() => {
    notesRouter.retrieveNotePassages = original;
  });
  // NOTE: buildAutoNoteContext captured the original reference at require
  // time via destructuring in tutor.js, so stub the module-level binding
  // through the router export indirection instead.
  const ctx = await buildAutoNoteContext("u1", [
    { role: "user", content: "first question" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "what is mitochondria?" },
  ]);
  assert.match(ctx, /=== NOTE: T ===/);
  assert.match(ctx, /passage text/);
});

test("buildAutoNoteContext returns empty when nothing matches", async (t) => {
  const original = notesRouter.retrieveNotePassages;
  notesRouter.retrieveNotePassages = async () => [];
  t.after(() => {
    notesRouter.retrieveNotePassages = original;
  });
  const ctx = await buildAutoNoteContext("u1", [{ role: "user", content: "xyzzy" }]);
  assert.equal(ctx, "");
});

// ── getRecentWeakConcepts (stubbed VoiceSession.find) ─────────

function stubVoiceSessionFind(t, sessions) {
  const original = VoiceSession.find;
  VoiceSession.find = () => {
    const chain = {};
    chain.sort = () => chain;
    chain.limit = () => chain;
    chain.select = () => chain;
    chain.lean = async () => sessions;
    return chain;
  };
  t.after(() => {
    VoiceSession.find = original;
  });
}

test("getRecentWeakConcepts dedupes across sessions and caps", async (t) => {
  stubVoiceSessionFind(t, [
    { weakConcepts: ["Mitosis", "pH"] },
    { weakConcepts: ["mitosis", "Osmosis"] },
  ]);
  const out = await getRecentWeakConcepts("u1", 2);
  assert.deepEqual(out, ["Mitosis", "pH"]);
});

test("getRecentWeakConcepts never throws", async (t) => {
  const original = VoiceSession.find;
  VoiceSession.find = () => {
    throw new Error("db down");
  };
  t.after(() => {
    VoiceSession.find = original;
  });
  assert.deepEqual(await getRecentWeakConcepts("u1"), []);
});

// ── index definition ──────────────────────────────────────────

test("Note schema defines the weighted text index", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "models", "Note.js"), "utf8");
  assert.match(src, /note_text_search/);
  assert.match(src, /\{\s*title:\s*"text",\s*content:\s*"text",\s*tags:\s*"text"\s*\}/);
});

test("GET /search is registered above /:id", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "notes.js"), "utf8");
  const searchAt = src.indexOf('router.get("/search"');
  const idAt = src.indexOf('router.get("/:id"');
  assert.ok(searchAt !== -1 && idAt !== -1 && searchAt < idAt);
});
