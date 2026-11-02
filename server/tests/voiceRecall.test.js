// Voice-recall H8/M14 regression tests.
// H8: /evaluate grades against the server-persisted key points from the
// /generate-questions draft — client-supplied key points are never trusted.
// A devtools user forging keys to match their spoken answer must NOT get
// a free 100% (the quiz /submit slice-40 fix, applied here to voice).
// M14: a provider JSON parse failure inside evaluateVoiceAnswer must
// surface as "unevaluated" with no score — never as a permanent
// 0/"incorrect".
// No database is connected here: Note/VoiceSession/User/StudySession
// methods and the AI/access services are stubbed per test, so these assert
// the route's own decisions, not MongoDB or OpenRouter.
// Fake ids and keys only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

// Patch the service modules BEFORE the route destructures them at load.
// Per-test behaviour is driven through the mutable `runtime` holder.
const ai = require("../services/ai");
const access = require("../services/openrouterAccess");

const runtime = {
  generateQuestions: null,
  nextEvaluation: null,
  evalCalls: [],
  refunds: [],
};

const _origGen = ai.generateVoiceRecallQuestions;
ai.generateVoiceRecallQuestions = async (...args) =>
  runtime.generateQuestions(...args);
const _origEval = ai.evaluateVoiceAnswer;
ai.evaluateVoiceAnswer = async (question, keyPoints, spokenAnswer, confidence) => {
  runtime.evalCalls.push({ question, keyPoints, spokenAnswer, confidence });
  return typeof runtime.nextEvaluation === "function"
    ? runtime.nextEvaluation()
    : runtime.nextEvaluation;
};
const _origAccess = access.requireOpenRouterAccess;
access.requireOpenRouterAccess = async () => ({ apiKey: "test-key" });
const _origRefund = access.refundCreditSpend;
access.refundCreditSpend = async () => {
  runtime.refunds.push(true);
};

const User = require("../models/User");
const Note = require("../models/Note");
const VoiceSession = require("../models/VoiceSession");
const StudySession = require("../models/StudySession");
const voiceRecallRouter = require("../routes/voice-recall");

const JWT_SECRET = "voice-recall-test-secret-not-real";
const USER_ID = "user-1";
const NOTE_ID = "507f1f77bcf86cd799439011";
const SET_ID = "507f1f77bcf86cd799439012";

const STORED_QUESTIONS = [
  {
    question: "What is photosynthesis?",
    keyPoints: ["chlorophyll", "sunlight", "glucose"],
    difficulty: "easy",
  },
  {
    question: "Where does it occur?",
    keyPoints: ["chloroplast"],
    difficulty: "medium",
  },
];

// The exact object ai.js returns when its own JSON parse of the provider
// response fails (see evaluateVoiceAnswer in services/ai.js).
function parseFallbackEvaluation(keyPoints) {
  return {
    score: 0,
    verdict: "incorrect",
    whatWasCorrect: "",
    whatWasMissed: keyPoints,
    improvement: "Please try again",
    encouragement: "You can do better!",
  };
}

function storedDraft(overrides = {}) {
  return {
    _id: SET_ID,
    userId: USER_ID,
    questions: STORED_QUESTIONS.map((q) => q.question),
    responses: STORED_QUESTIONS.map((q) => ({
      question: q.question,
      expectedConcepts: q.keyPoints,
    })),
    avgScore: -1,
    ...overrides,
  };
}

async function startApp(t, stubs) {
  const origJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = JWT_SECRET;
  t.after(() => {
    if (origJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = origJwtSecret;
  });

  const calls = {
    created: [],
    findOneAndUpdate: [],
    historyFilter: null,
  };
  runtime.generateQuestions =
    stubs.generateQuestions || (async () => STORED_QUESTIONS);
  runtime.nextEvaluation = stubs.nextEvaluation;
  runtime.evalCalls = [];
  runtime.refunds = [];
  // Expose the module-level captures under `calls` for the assertions.
  Object.defineProperties(calls, {
    evalCalls: { get: () => runtime.evalCalls },
    refunds: { get: () => runtime.refunds },
  });

  const origUserFindById = User.findById;
  User.findById = () => ({
    select: async () => ({
      toObject: () => ({ _id: USER_ID, name: "Test", isDemo: false }),
    }),
  });

  const origNoteFindOne = Note.findOne;
  Note.findOne = stubs.noteFindOne || (async () => ({
    _id: NOTE_ID,
    title: "Biology notes",
    subject: "Biology",
    content: "<p>Plants use chlorophyll and sunlight to make glucose.</p>",
  }));

  const origVsCreate = VoiceSession.create;
  VoiceSession.create = async (doc) => {
    calls.created.push(doc);
    return { _id: SET_ID, ...doc };
  };
  const origVsDeleteMany = VoiceSession.deleteMany;
  VoiceSession.deleteMany = async () => ({ deletedCount: 0 });
  const origVsFindOne = VoiceSession.findOne;
  VoiceSession.findOne = stubs.draftFindOne || (async () => storedDraft());
  const origVsFindOneAndUpdate = VoiceSession.findOneAndUpdate;
  VoiceSession.findOneAndUpdate = async (filter, update, opts) => {
    calls.findOneAndUpdate.push({ filter, update, opts });
    return stubs.finalizedDoc || { _id: SET_ID, weakConcepts: [] };
  };
  const origVsFind = VoiceSession.find;
  VoiceSession.find = (filter) => {
    calls.historyFilter = filter;
    return {
      sort: () => ({
        limit: () => ({
          select: () => ({ lean: async () => [] }),
        }),
      }),
    };
  };

  const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
  User.findByIdAndUpdate = async () => ({});
  const origStudySessionCreate = StudySession.create;
  StudySession.create = async () => ({});

  t.after(() => {
    User.findById = origUserFindById;
    Note.findOne = origNoteFindOne;
    VoiceSession.create = origVsCreate;
    VoiceSession.deleteMany = origVsDeleteMany;
    VoiceSession.findOne = origVsFindOne;
    VoiceSession.findOneAndUpdate = origVsFindOneAndUpdate;
    VoiceSession.find = origVsFind;
    User.findByIdAndUpdate = origUserFindByIdAndUpdate;
    StudySession.create = origStudySessionCreate;
    ai.generateVoiceRecallQuestions = _origGen;
    ai.evaluateVoiceAnswer = _origEval;
    access.requireOpenRouterAccess = _origAccess;
    access.refundCreditSpend = _origRefund;
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/voice-recall", voiceRecallRouter);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || "error" });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);
  const post = async (path, body) => {
    const res = await fetch(`${base}/api/voice-recall${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `token=${token}`,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const get = async (path) => {
    const res = await fetch(`${base}/api/voice-recall${path}`, {
      headers: { cookie: `token=${token}` },
    });
    return { status: res.status, body: await res.json() };
  };
  return { post, get, calls };
}

test("generate-questions persists key points server-side and returns a set id", async (t) => {
  const { post, calls } = await startApp(t, {});
  const { status, body } = await post("/generate-questions", {
    noteId: NOTE_ID,
    count: 2,
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.questionSetId, SET_ID);
  // The draft stores the key points the AI generated — the grading source.
  assert.equal(calls.created.length, 1);
  const draft = calls.created[0];
  assert.equal(draft.avgScore, -1);
  assert.deepEqual(
    draft.responses[0].expectedConcepts,
    STORED_QUESTIONS[0].keyPoints,
  );
  assert.deepEqual(
    draft.responses[1].expectedConcepts,
    STORED_QUESTIONS[1].keyPoints,
  );
  // M5: the source window is disclosed.
  assert.equal(typeof body.questionSource.usedChars, "number");
  assert.equal(typeof body.questionSource.totalChars, "number");
  assert.equal(typeof body.questionSource.truncated, "boolean");
});

test("forged client keyPoints are ignored; stored keys grade", async (t) => {
  const { post, calls } = await startApp(t, {
    nextEvaluation: {
      score: 100,
      verdict: "excellent",
      whatWasCorrect: "all",
      whatWasMissed: [],
      improvement: "",
      encouragement: "nice",
    },
  });
  const { status, body } = await post("/evaluate", {
    questionSetId: SET_ID,
    questionIndex: 0,
    // Old contract field: zod strips it, and the handler never reads it.
    correctKeyPoints: ["forged", "keys", "matching my answer"],
    spokenAnswer: "forged keys matching my answer",
    confidence: 5,
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.evalCalls.length, 1);
  // The AI graded against the STORED key points, not the forged ones.
  assert.deepEqual(
    calls.evalCalls[0].keyPoints,
    STORED_QUESTIONS[0].keyPoints,
  );
  assert.equal(calls.evalCalls[0].question, STORED_QUESTIONS[0].question);
});

test("evaluate without a questionSetId is rejected, not graded", async (t) => {
  const { post, calls } = await startApp(t, {
    nextEvaluation: { score: 50, verdict: "partial" },
  });
  const { status } = await post("/evaluate", {
    questionIndex: 0,
    spokenAnswer: "something",
    confidence: 3,
  });
  assert.equal(status, 400);
  assert.equal(calls.evalCalls.length, 0);
});

test("evaluate against another user's (or missing) set is 404", async (t) => {
  let seenFilter = null;
  const { post, calls } = await startApp(t, {
    draftFindOne: async (filter) => {
      seenFilter = filter;
      return null;
    },
    nextEvaluation: { score: 50, verdict: "partial" },
  });
  const { status, body } = await post("/evaluate", {
    questionSetId: SET_ID,
    questionIndex: 0,
    spokenAnswer: "something",
    confidence: 3,
  });
  assert.equal(status, 404);
  assert.match(body.message, /not found or expired/);
  // The lookup is scoped to the caller.
  assert.equal(seenFilter.userId, USER_ID);
  assert.equal(calls.evalCalls.length, 0);
});

test("evaluate with a malformed set id is 400, not 500", async (t) => {
  const { post, calls } = await startApp(t, {
    nextEvaluation: { score: 50, verdict: "partial" },
  });
  const { status } = await post("/evaluate", {
    questionSetId: "not-an-objectid",
    questionIndex: 0,
    spokenAnswer: "something",
    confidence: 3,
  });
  assert.equal(status, 400);
  assert.equal(calls.evalCalls.length, 0);
});

test("provider parse failure becomes unevaluated with no score (M14)", async (t) => {
  const { post } = await startApp(t, {
    nextEvaluation: () =>
      parseFallbackEvaluation(STORED_QUESTIONS[0].keyPoints),
  });
  const { status, body } = await post("/evaluate", {
    questionSetId: SET_ID,
    questionIndex: 0,
    spokenAnswer: "a real answer the provider failed to score",
    confidence: 4,
  });
  assert.equal(status, 200);
  assert.equal(body.evaluation.verdict, "unevaluated");
  assert.equal(body.evaluation.score, null);
  assert.deepEqual(body.evaluation.whatWasMissed, []);
});

test("a genuine incorrect verdict still passes through untouched", async (t) => {
  const genuine = {
    score: 0,
    verdict: "incorrect",
    whatWasCorrect: "you mentioned sunlight",
    whatWasMissed: ["chlorophyll", "glucose"],
    improvement: "Mention chlorophyll too",
    encouragement: "Keep going",
  };
  const { post } = await startApp(t, { nextEvaluation: genuine });
  const { status, body } = await post("/evaluate", {
    questionSetId: SET_ID,
    questionIndex: 0,
    spokenAnswer: "sunlight is involved",
    confidence: 2,
  });
  assert.equal(status, 200);
  // Not the parse-fallback signature, so it must not be rewritten.
  assert.deepEqual(body.evaluation, genuine);
});

test("empty generation is a 502 with a credit refund, not an empty draft", async (t) => {
  const { post, calls } = await startApp(t, {
    generateQuestions: async () => [],
  });
  const { status, body } = await post("/generate-questions", {
    noteId: NOTE_ID,
    count: 2,
  });
  assert.equal(status, 502);
  assert.equal(body.success, false);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.refunds.length, 1);
});

test("save-session finalizes the draft instead of creating a new doc", async (t) => {
  const { post, calls } = await startApp(t, {
    finalizedDoc: { _id: SET_ID, weakConcepts: ["chlorophyll"] },
  });
  const { status, body } = await post("/save-session", {
    noteId: NOTE_ID,
    questionSetId: SET_ID,
    questions: STORED_QUESTIONS.map((q) => q.question),
    responses: [
      {
        question: STORED_QUESTIONS[0].question,
        spokenAnswer: "plants do it",
        score: 70,
        verdict: "good",
      },
      {
        question: STORED_QUESTIONS[1].question,
        spokenAnswer: "",
        score: null,
        verdict: "unevaluated",
      },
    ],
    avgScore: 70,
    weakConcepts: ["chlorophyll", "chlorophyll"],
  });
  assert.equal(status, 201);
  assert.equal(body.sessionId, SET_ID);
  // The draft was updated in place (scoped to caller + draft state)…
  assert.equal(calls.findOneAndUpdate.length, 1);
  const { filter, update } = calls.findOneAndUpdate[0];
  assert.equal(filter.userId, USER_ID);
  assert.equal(filter.avgScore, -1);
  assert.ok(update.completedAt instanceof Date);
  // …weak concepts deduped, and no second document created.
  assert.deepEqual(update.weakConcepts, ["chlorophyll"]);
  assert.equal(calls.created.length, 0);
});

test("history hides unevaluated drafts", async (t) => {
  const { get, calls } = await startApp(t, {});
  const { status, body } = await get("/history");
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(calls.historyFilter, {
    userId: USER_ID,
    avgScore: { $gte: 0 },
  });
});
