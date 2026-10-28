// Quiz /submit grades against the stored quiz, never against
// client-supplied questions (Backend M5, slice 40). The old handler
// graded the submitted correctIndex, so a client could submit
// matching answers and always score 100%, poisoning quiz scores,
// weak topics, dashboard accuracy, and streaks. No database is
// connected here: Quiz/Deck/User/StudySession methods are stubbed
// per test, so these assert the route's own decisions, not MongoDB.
// Fake ids and keys only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Quiz = require("../models/Quiz");
const Deck = require("../models/Deck");
const StudySession = require("../models/StudySession");
const quizRouter = require("../routes/quiz");

const JWT_SECRET = "quiz-submit-test-secret-not-real";

function storedQuiz(overrides = {}) {
  return {
    _id: "quiz-1",
    userId: "user-1",
    subject: "Biology",
    deckName: "Bio Quiz",
    deckId: null,
    completedAt: null,
    questions: [
      {
        question: "What is the powerhouse of the cell?",
        options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
        correctAnswer: 1,
        explanation: "Mitochondria produce ATP.",
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

// Forged questions: correctIndex set to match the submitted answers
// exactly, so the OLD handler would have scored 100% for answers
// [0, 1]. The stored answers are [1, 0], so honest grading scores 0.
function forgedQuestions() {
  return [
    {
      question: "What is the powerhouse of the cell?",
      options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
      correctIndex: 0,
      explanation: "Mitochondria produce ATP.",
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
      explanation: "",
      concept: "Genetics",
    },
  ];
}

async function startApp(t, stubs) {
  const origJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = JWT_SECRET;
  t.after(() => {
    if (origJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = origJwtSecret;
  });
  const origUserFindById = User.findById;
  User.findById = () => ({
    select: async () => ({
      toObject: () => ({ _id: "user-1", name: "Test", isDemo: false }),
    }),
  });
  t.after(() => {
    User.findById = origUserFindById;
  });

  const origQuizFindOne = Quiz.findOne;
  const origQuizFindOneAndUpdate = Quiz.findOneAndUpdate;
  const origDeckFindOne = Deck.findOne;
  const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
  const origStudySessionCreate = StudySession.create;
  Quiz.findOne = stubs.quizFindOne;
  Quiz.findOneAndUpdate = stubs.findOneAndUpdate;
  Deck.findOne = stubs.deckFindOne || (async () => null);
  User.findByIdAndUpdate = async () => ({});
  StudySession.create = async () => ({});
  t.after(() => {
    Quiz.findOne = origQuizFindOne;
    Quiz.findOneAndUpdate = origQuizFindOneAndUpdate;
    Deck.findOne = origDeckFindOne;
    User.findByIdAndUpdate = origUserFindByIdAndUpdate;
    StudySession.create = origStudySessionCreate;
  });

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
  t.after(
    () => new Promise((resolve) => server.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
  const post = async (body) => {
    const res = await fetch(`${base}/api/quiz/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `token=${token}`,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { post };
}

function updateStub(calls) {
  return async (filter, update) => {
    calls.push({ filter, update });
    return { _id: "quiz-1", subject: "Biology" };
  };
}

test("forged client correctIndex is ignored; stored answers grade", async (t) => {
  const calls = [];
  const { post } = await startApp(t, {
    quizFindOne: async (filter) => {
      assert.equal(filter.userId, "user-1");
      return storedQuiz();
    },
    findOneAndUpdate: updateStub(calls),
  });
  const { status, body } = await post({
    quizId: "quiz-1",
    questions: forgedQuestions(),
    answers: [0, 1],
    timeTaken: 60,
    subject: "Forged Subject",
  });
  assert.equal(status, 200);
  assert.equal(body.score, 0);
  assert.equal(body.correctCount, 0);
  assert.equal(body.questionResults[0].correctIndex, 1);
  assert.equal(body.questionResults[1].correctIndex, 0);
  // The persisted questions carry the STORED answers, not the forged ones.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].update.questions[0].correctAnswer, 1);
  assert.equal(calls[0].update.questions[1].correctAnswer, 0);
  // And the stored subject wins over the body subject.
  assert.equal(calls[0].update.subject, "Biology");
});

test("honest answers against stored questions score correctly", async (t) => {
  const { post } = await startApp(t, {
    quizFindOne: async () => storedQuiz(),
    findOneAndUpdate: updateStub([]),
  });
  const { status, body } = await post({
    quizId: "quiz-1",
    questions: forgedQuestions(),
    answers: [1, 0],
    timeTaken: 60,
  });
  assert.equal(status, 200);
  assert.equal(body.score, 100);
  assert.equal(body.correctCount, 2);
  assert.deepEqual(body.weakTopics, []);
});

test("a quiz that is not the caller's (or missing) reads as 404", async (t) => {
  const { post } = await startApp(t, {
    quizFindOne: async () => null,
    findOneAndUpdate: updateStub([]),
  });
  const { status, body } = await post({
    quizId: "someone-elses-quiz",
    answers: [1, 0],
    timeTaken: 60,
  });
  assert.equal(status, 404);
  assert.equal(body.error, "Quiz not found");
});

test("an already-submitted quiz cannot be re-graded", async (t) => {
  const calls = [];
  const { post } = await startApp(t, {
    quizFindOne: async () => storedQuiz({ completedAt: new Date() }),
    findOneAndUpdate: updateStub(calls),
  });
  const { status, body } = await post({
    quizId: "quiz-1",
    answers: [1, 0],
    timeTaken: 60,
  });
  assert.equal(status, 400);
  assert.equal(body.error, "Quiz already submitted");
  assert.equal(calls.length, 0);
});

test("submit without a quizId is rejected, not graded from the body", async (t) => {
  const calls = [];
  const { post } = await startApp(t, {
    quizFindOne: async () => storedQuiz(),
    findOneAndUpdate: updateStub(calls),
  });
  const { status } = await post({
    questions: forgedQuestions(),
    answers: [0, 1],
    timeTaken: 60,
  });
  assert.equal(status, 400);
  assert.equal(calls.length, 0);
});

test("a deck id from another user is rejected before any write", async (t) => {
  const calls = [];
  const { post } = await startApp(t, {
    quizFindOne: async () => storedQuiz(),
    findOneAndUpdate: updateStub(calls),
  });
  // Deck.findOne defaults to null in startApp when no stub is given,
  // which is exactly the foreign-deck case.
  const { status, body } = await post({
    quizId: "quiz-1",
    deckId: "someone-elses-deck",
    answers: [1, 0],
    timeTaken: 60,
  });
  assert.equal(status, 400);
  assert.equal(body.error, "Deck not found");
  assert.equal(calls.length, 0);
});

test("storedQuestionsForGrading maps stored fields to grading shape", () => {
  const graded = quizRouter.storedQuestionsForGrading(
    storedQuiz({
      questions: [
        {
          question: "Q?",
          options: ["a", "b", "c", "d"],
          correctAnswer: 2,
          explanation: null,
          topic: null,
        },
      ],
    }),
  );
  assert.deepEqual(graded, [
    {
      question: "Q?",
      options: ["a", "b", "c", "d"],
      correctIndex: 2,
      explanation: "",
      concept: "General",
    },
  ]);
});
