// Quiz explanations + weak-concept difficulty mix (slice 158).
// - Generation stores a 1-2 sentence explanation per question and the
//   prompt instructs the model accordingly (single AI call, no extra
//   credit spend).
// - Generation biases ~40% of questions toward the student's recent
//   voice-session weakConcepts (last 3 sessions, deduped, cap 10);
//   with no weak concepts the prompt carries no bias line.
// - Submit grades server-side against the stored quiz and returns the
//   STORED explanations per question (wrong answers included); a forged
//   client explanation never leaks into results.
// - Missing explanations (old quizzes) surface as "" so the client can
//   hide the explanation block.
// No database, no network: model methods and provider calls are stubbed
// per test. The AI + credit-gate stubs are installed BEFORE requiring
// the router because quiz.js destructures them at load time.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "quiz-explanations-test-secret-not-real";
const USER_ID = "user-1";

const openrouterAccess = require("../services/openrouterAccess");
const aiService = require("../services/ai");

let gateCalls = 0;
const origGate = openrouterAccess.requireOpenRouterAccess;
openrouterAccess.requireOpenRouterAccess = async () => {
  gateCalls += 1;
  return { apiKey: "fake-or-key", creditFunded: false };
};

let seenPrompt = null;
const origCallOpenRouter = aiService.callOpenRouter;
aiService.callOpenRouter = async (messages) => {
  seenPrompt = messages;
  return JSON.stringify([
    {
      question: "What is the powerhouse of the cell?",
      options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
      correctIndex: 1,
      explanation: "Mitochondria generate ATP through cellular respiration, which powers the cell.",
      concept: "Cells",
    },
    {
      question: "What does DNA stand for?",
      options: [
        "Deoxyribonucleic acid",
        "Diribonucleic acid",
        "Deoxyribose nucleic atom",
        "Dinucleic acid",
      ],
      correctIndex: 0,
      explanation: "DNA is deoxyribonucleic acid, the molecule carrying genetic instructions.",
      concept: "Genetics",
    },
  ]);
};

const User = require("../models/User");
const Quiz = require("../models/Quiz");
const Deck = require("../models/Deck");
const StudySession = require("../models/StudySession");
const VoiceSession = require("../models/VoiceSession");
const quizRouter = require("../routes/quiz");

function promptText() {
  return (seenPrompt || [])
    .map((m) => String(m.content || ""))
    .join("\n");
}

function stubMethod(t, obj, name, impl) {
  const original = obj[name];
  obj[name] = impl;
  t.after(() => {
    obj[name] = original;
  });
}

function stubVoiceSessions(t, sessions) {
  let seenFilter = null;
  stubMethod(t, VoiceSession, "find", (filter) => {
    seenFilter = filter;
    return {
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => sessions,
          }),
        }),
      }),
    };
  });
  return () => seenFilter;
}

function authStubs(t) {
  stubMethod(t, User, "findById", () => ({
    select: async () => ({
      toObject: () => ({ _id: USER_ID, name: "Test", isDemo: false }),
    }),
  }));
}

async function startApp(t) {
  const origSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = JWT_SECRET;
  t.after(() => {
    if (origSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = origSecret;
  });
  authStubs(t);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/quiz", quizRouter);
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
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `token=${token}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { post };
}

function storedQuiz(overrides = {}) {
  return {
    _id: "quiz-9",
    userId: USER_ID,
    subject: "Biology",
    deckName: "Bio Quiz",
    deckId: null,
    completedAt: null,
    questions: [
      {
        question: "What is the powerhouse of the cell?",
        options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
        correctAnswer: 1,
        explanation: "Mitochondria generate ATP through cellular respiration.",
        topic: "Cells",
      },
      {
        question: "What does DNA stand for?",
        options: [
          "Deoxyribonucleic acid",
          "Diribonucleic acid",
          "Deoxyribose nucleic atom",
          "Dinucleic acid",
        ],
        correctAnswer: 0,
        explanation: "",
        topic: "Genetics",
      },
    ],
    ...overrides,
  };
}

// ---------- generation ----------

test("generate stores a 1-2 sentence explanation per question", async (t) => {
  stubVoiceSessions(t, []);
  const created = [];
  stubMethod(t, Quiz, "create", async (doc) => {
    const quiz = { _id: "quiz-new", ...doc };
    created.push(quiz);
    return quiz;
  });
  const { post } = await startApp(t);
  const { status, body } = await post("/api/quiz/generate", {
    subject: "Explanations 101",
    count: 5,
    difficulty: "medium",
  });
  assert.equal(status, 201);
  assert.equal(created.length, 1);
  const stored = created[0].questions;
  assert.equal(stored.length, 2);
  for (const q of stored) {
    assert.ok(q.explanation && q.explanation.length > 0, "explanation stored");
  }
  assert.match(stored[0].explanation, /Mitochondria/);
  // The API response carries explanations too.
  assert.equal(body.questions[0].explanation, stored[0].explanation);
});

test("generate prompt instructs 1-2 sentence teaching explanations", async (t) => {
  stubVoiceSessions(t, []);
  stubMethod(t, Quiz, "create", async (doc) => ({ _id: "quiz-new", ...doc }));
  const { post } = await startApp(t);
  const { status } = await post("/api/quiz/generate", {
    subject: "Prompt Shape",
    count: 5,
    difficulty: "medium",
  });
  assert.equal(status, 201);
  const text = promptText();
  assert.match(text, /1-2 sentences/);
  assert.match(text, /why the correct answer is right/);
  assert.match(text, /"explanation": "1-2 sentences explaining why the correct answer is right"/);
});

test("generate weights ~40% of questions toward recent weak concepts", async (t) => {
  const getFilter = stubVoiceSessions(t, [
    { weakConcepts: ["Mitochondria", "ATP synthesis"] },
    { weakConcepts: ["atp synthesis", "Krebs cycle"] },
    { weakConcepts: [] },
  ]);
  stubMethod(t, Quiz, "create", async (doc) => ({ _id: "quiz-new", ...doc }));
  const { post } = await startApp(t);
  const { status } = await post("/api/quiz/generate", {
    subject: "Weakness Mix",
    count: 10,
    difficulty: "medium",
  });
  assert.equal(status, 201);
  // Queried the caller's own completed voice sessions.
  assert.equal(getFilter().userId, USER_ID);
  const text = promptText();
  // Deduped case-insensitively, cap respected, bias line present.
  assert.match(text, /recently struggled with these concepts/);
  assert.match(text, /Mitochondria/);
  assert.match(text, /ATP synthesis/);
  assert.match(text, /Krebs cycle/);
  assert.match(text, /roughly 40%/);
  assert.doesNotMatch(text, /atp synthesis; ATP synthesis/);
});

test("generate carries no weakness bias when the student has none", async (t) => {
  stubVoiceSessions(t, []);
  stubMethod(t, Quiz, "create", async (doc) => ({ _id: "quiz-new", ...doc }));
  const { post } = await startApp(t);
  const { status } = await post("/api/quiz/generate", {
    subject: "No Weakness",
    count: 5,
    difficulty: "easy",
  });
  assert.equal(status, 201);
  assert.doesNotMatch(promptText(), /recently struggled/);
});

test("a weak-concept lookup failure still generates the quiz", async (t) => {
  stubMethod(t, VoiceSession, "find", () => {
    throw new Error("db down");
  });
  stubMethod(t, Quiz, "create", async (doc) => ({ _id: "quiz-new", ...doc }));
  const { post } = await startApp(t);
  const { status } = await post("/api/quiz/generate", {
    subject: "Lookup Failure",
    count: 5,
    difficulty: "easy",
  });
  assert.equal(status, 201);
  assert.doesNotMatch(promptText(), /recently struggled/);
});

// ---------- submit ----------

function submitStubs(t, stored) {
  const calls = [];
  stubMethod(t, Quiz, "findOne", async () => stored);
  stubMethod(t, Quiz, "findOneAndUpdate", async (filter, update) => {
    calls.push({ filter, update });
    return { _id: stored._id, subject: stored.subject };
  });
  stubMethod(t, Deck, "findOne", async () => null);
  stubMethod(t, User, "findByIdAndUpdate", async () => ({}));
  stubMethod(t, StudySession, "create", async () => ({}));
  return calls;
}

test("submit returns stored explanations for wrong answers; grading stays server-side", async (t) => {
  submitStubs(t, storedQuiz());
  const { post } = await startApp(t);
  // Answers [0, 1]: both wrong against stored [1, 0]. The client also
  // forges questions with flipped answers and bogus explanations —
  // grading and explanations must come from the stored quiz.
  const { status, body } = await post("/api/quiz/submit", {
    quizId: "quiz-9",
    questions: [
      {
        question: "What is the powerhouse of the cell?",
        options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
        correctIndex: 0,
        explanation: "FORGED: the nucleus is the powerhouse.",
        concept: "Cells",
      },
      {
        question: "What does DNA stand for?",
        options: [
          "Deoxyribonucleic acid",
          "Diribonucleic acid",
          "Deoxyribose nucleic atom",
          "Dinucleic acid",
        ],
        correctIndex: 1,
        explanation: "FORGED",
        concept: "Genetics",
      },
    ],
    answers: [0, 1],
    timeTaken: 45,
  });
  assert.equal(status, 200);
  assert.equal(body.score, 0);
  assert.equal(body.questionResults.length, 2);
  // Stored grading, not the forged client answers.
  assert.equal(body.questionResults[0].correctIndex, 1);
  assert.equal(body.questionResults[0].isCorrect, false);
  // Stored explanations, never the forged ones.
  assert.equal(
    body.questionResults[0].explanation,
    "Mitochondria generate ATP through cellular respiration.",
  );
  assert.doesNotMatch(body.questionResults[0].explanation, /FORGED/);
  // Explanations ride along for right answers too; the client decides
  // what to display.
  assert.ok("explanation" in body.questionResults[1]);
});

test("missing explanations surface as empty strings (client hides the block)", async (t) => {
  submitStubs(
    t,
    storedQuiz({
      questions: [
        {
          question: "Old question?",
          options: ["a", "b", "c", "d"],
          correctAnswer: 2,
          explanation: null,
          topic: "Old",
        },
      ],
    }),
  );
  const { post } = await startApp(t);
  const { status, body } = await post("/api/quiz/submit", {
    quizId: "quiz-9",
    answers: [0],
    timeTaken: 10,
  });
  assert.equal(status, 200);
  assert.equal(body.questionResults[0].explanation, "");
  assert.equal(body.questionResults[0].isCorrect, false);
});

test("storedQuestionsForGrading maps a missing explanation to empty string", () => {
  const graded = quizRouter.storedQuestionsForGrading(
    storedQuiz({
      questions: [
        {
          question: "Q?",
          options: ["a", "b", "c", "d"],
          correctAnswer: 2,
          topic: null,
        },
      ],
    }),
  );
  assert.equal(graded[0].explanation, "");
  assert.equal(graded[0].concept, "General");
});
