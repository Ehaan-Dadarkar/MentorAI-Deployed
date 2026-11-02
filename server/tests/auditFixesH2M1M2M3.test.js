// Regression tests for the PayPal-recovery + quiz audit slice
// (H2, M1, M2, M3). No database, no network, no live PayPal: model
// methods and provider calls are stubbed per test, so these assert
// the routes' own decisions.
process.env.PAYPAL_CLIENT_ID = "fake-client-id";
process.env.PAYPAL_CLIENT_SECRET = "fake-client-secret";
delete process.env.PAYPAL_API_BASE;

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

// Same bare specifier credits.js uses, so this is the same axios object.
const axios = require("axios");

const JWT_SECRET = "test-jwt-secret-for-audit-fixes-00";
const USER_ID = "user-1";

// Stub the credit gate + provider BEFORE requiring the quiz router:
// quiz.js destructures them at load time.
const openrouterAccess = require("../services/openrouterAccess");
const aiService = require("../services/ai");
let gateCalls = 0;
const origGate = openrouterAccess.requireOpenRouterAccess;
openrouterAccess.requireOpenRouterAccess = async () => {
  gateCalls += 1;
  return { apiKey: "fake-or-key", creditFunded: false };
};
const origCallOpenRouter = aiService.callOpenRouter;
aiService.callOpenRouter = async () =>
  JSON.stringify([
    {
      question: "What is 2+2?",
      options: ["3", "4", "5", "6"],
      correctIndex: 1,
      explanation: "2+2 is 4.",
      concept: "Arithmetic",
    },
  ]);

const Quiz = require("../models/Quiz");
const Deck = require("../models/Deck");
const User = require("../models/User");
const StudySession = require("../models/StudySession");
const quizRouter = require("../routes/quiz");

const paypal = require("../services/paypal");
const creditsService = require("../services/credits");
const CreditPurchase = require("../models/CreditPurchase");
const creditsRouter = require("../routes/credits");

function authStubs(t) {
  const origUserFindById = User.findById;
  User.findById = () => ({
    select: async () => ({
      toObject: () => ({ _id: USER_ID, name: "Test", isDemo: false }),
    }),
  });
  t.after(() => {
    User.findById = origUserFindById;
  });
}

async function startApp(t, router, mountPath) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(mountPath, router);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || "error" });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);
  const origSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = JWT_SECRET;
  t.after(() => {
    if (origSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = origSecret;
  });
  const request = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: `token=${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
  return { request };
}

function stubMethod(t, obj, name, impl) {
  const original = obj[name];
  obj[name] = impl;
  t.after(() => {
    obj[name] = original;
  });
}

// ---------- M1: cache hit serves free, gate runs only on a miss ----------

test("M1: second identical generate is a cache hit and does not call the credit gate", async (t) => {
  authStubs(t);
  gateCalls = 0;
  const created = [];
  stubMethod(t, Quiz, "create", async (doc) => {
    const quiz = { _id: `quiz-${created.length}`, ...doc };
    created.push(quiz);
    return quiz;
  });
  const { request } = await startApp(t, quizRouter, "/api/quiz");
  const body = { subject: "Math", count: 5, difficulty: "medium" };

  const first = await request("POST", "/api/quiz/generate", body);
  assert.equal(first.status, 201);
  assert.equal(gateCalls, 1);

  const second = await request("POST", "/api/quiz/generate", body);
  assert.equal(second.status, 201);
  assert.equal(gateCalls, 1, "cache hit must not reach the credit gate");
  assert.deepEqual(second.json.questions, first.json.questions);
});

// ---------- M2: concurrent submits, one completion wins ----------

function storedQuizDoc(overrides = {}) {
  return {
    _id: "quiz-1",
    userId: USER_ID,
    subject: "Biology",
    deckName: "Bio Quiz",
    deckId: null,
    completedAt: null,
    questions: [
      {
        question: "Powerhouse of the cell?",
        options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
        correctAnswer: 1,
        explanation: "Mitochondria produce ATP.",
        topic: "Cells",
      },
    ],
    ...overrides,
  };
}

test("M2: the completion update filters on completedAt {$exists: false}", async (t) => {
  authStubs(t);
  let seenFilter = null;
  let sessionsCreated = 0;
  const stored = storedQuizDoc();
  const completed = { ...storedQuizDoc(), completedAt: new Date().toISOString() };
  stubMethod(t, Quiz, "findOne", async () => stored);
  stubMethod(t, Quiz, "findOneAndUpdate", async (filter) => {
    seenFilter = filter;
    return { ...completed, toObject: undefined };
  });
  stubMethod(t, Quiz, "exists", async () => true);
  stubMethod(t, Deck, "findOne", async () => null);
  stubMethod(t, User, "findByIdAndUpdate", async () => ({}));
  stubMethod(t, StudySession, "create", async () => {
    sessionsCreated += 1;
    return {};
  });
  const { request } = await startApp(t, quizRouter, "/api/quiz");

  const res = await request("POST", "/api/quiz/submit", {
    quizId: "quiz-1",
    answers: [1],
    timeTaken: 30,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(seenFilter, {
    _id: "quiz-1",
    userId: USER_ID,
    completedAt: { $exists: false },
  });
  assert.equal(sessionsCreated, 1);
});

test("M2: loser of the completion race gets 400 and persists no session", async (t) => {
  authStubs(t);
  let sessionsCreated = 0;
  stubMethod(t, Quiz, "findOne", async () => storedQuizDoc());
  // Simulates the atomic update matching nothing: someone else won.
  stubMethod(t, Quiz, "findOneAndUpdate", async () => null);
  stubMethod(t, Quiz, "exists", async () => true);
  stubMethod(t, Deck, "findOne", async () => null);
  stubMethod(t, User, "findByIdAndUpdate", async () => ({}));
  stubMethod(t, StudySession, "create", async () => {
    sessionsCreated += 1;
    return {};
  });
  const { request } = await startApp(t, quizRouter, "/api/quiz");

  const res = await request("POST", "/api/quiz/submit", {
    quizId: "quiz-1",
    answers: [1],
    timeTaken: 30,
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "Quiz already submitted");
  assert.equal(sessionsCreated, 0, "loser must not persist a study session");
});

test("M2: genuinely missing quiz still 404s", async (t) => {
  authStubs(t);
  stubMethod(t, Quiz, "findOne", async () => null);
  const { request } = await startApp(t, quizRouter, "/api/quiz");
  const res = await request("POST", "/api/quiz/submit", {
    quizId: "quiz-1",
    answers: [1],
    timeTaken: 30,
  });
  assert.equal(res.status, 404);
});

// ---------- M3: answer key stripped pre-submit ----------

function quizDocLike(overrides = {}) {
  const plain = storedQuizDoc(overrides);
  return { toObject: () => JSON.parse(JSON.stringify(plain)) };
}

test("M3: GET /:id strips correctAnswer and explanation before submit", async (t) => {
  authStubs(t);
  stubMethod(t, Quiz, "findOne", async () => quizDocLike());
  const { request } = await startApp(t, quizRouter, "/api/quiz");
  const res = await request("GET", "/api/quiz/quiz-1");
  assert.equal(res.status, 200);
  const q = res.json.quiz.questions[0];
  assert.ok(!("correctAnswer" in q), "correctAnswer must be stripped pre-submit");
  assert.ok(!("explanation" in q), "explanation must be stripped pre-submit");
  assert.equal(q.question, "Powerhouse of the cell?");
  assert.deepEqual(q.options, ["Nucleus", "Mitochondria", "Ribosome", "Golgi"]);
});

test("M3: GET /:id returns the full quiz after submit", async (t) => {
  authStubs(t);
  stubMethod(t, Quiz, "findOne", async () =>
    quizDocLike({ completedAt: new Date().toISOString() }),
  );
  const { request } = await startApp(t, quizRouter, "/api/quiz");
  const res = await request("GET", "/api/quiz/quiz-1");
  assert.equal(res.status, 200);
  const q = res.json.quiz.questions[0];
  assert.equal(q.correctAnswer, 1);
  assert.equal(q.explanation, "Mitochondria produce ATP.");
});

test("M3: legacy questions array without correctIndex still passes validation (grading ignores it)", async (t) => {
  authStubs(t);
  // The client no longer receives the answer key pre-submit, so its
  // legacy `questions` payload omits correctIndex (JSON drops the
  // undefined field). The array is ignored server-side (Backend M5),
  // so validation must accept the looser shape.
  stubMethod(t, Quiz, "findOne", async () => storedQuizDoc());
  const completed = { ...storedQuizDoc(), completedAt: new Date().toISOString() };
  stubMethod(t, Quiz, "findOneAndUpdate", async () => completed);
  stubMethod(t, Deck, "findOne", async () => null);
  stubMethod(t, User, "findByIdAndUpdate", async () => ({}));
  stubMethod(t, StudySession, "create", async () => ({}));
  const { request } = await startApp(t, quizRouter, "/api/quiz");
  const res = await request("POST", "/api/quiz/submit", {
    quizId: "quiz-1",
    questions: [
      {
        question: "Powerhouse of the cell?",
        options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
      },
    ],
    answers: [1],
    timeTaken: 30,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.score, 100);
});

// ---------- H2: pending purchases + retry capture ----------

test("H2: GET /purchases lists the caller's purchases", async (t) => {
  authStubs(t);
  let seenFilter = null;
  const rows = [
    {
      _id: "p1",
      paypalOrderId: "ORDER-1",
      packId: "starter",
      credits: 50,
      amountCents: 500,
      currency: "USD",
      status: "pending",
      createdAt: new Date("2026-11-02T00:00:00Z"),
    },
  ];
  stubMethod(t, CreditPurchase, "find", (filter) => {
    seenFilter = filter;
    return {
      sort: () => ({
        limit: () => ({
          select: () => ({ lean: async () => rows }),
        }),
      }),
    };
  });
  const { request } = await startApp(t, creditsRouter, "/api/credits");
  const res = await request("GET", "/api/credits/purchases");
  assert.equal(res.status, 200);
  assert.deepEqual(seenFilter, { userId: USER_ID });
  assert.equal(res.json.purchases.length, 1);
  assert.equal(res.json.purchases[0].paypalOrderId, "ORDER-1");
  assert.equal(res.json.purchases[0].status, "pending");
  assert.equal(res.json.purchases[0].amount, "5.00");
});

test("H2: retrying an already-captured order is idempotent and never calls PayPal", async (t) => {
  authStubs(t);
  let paypalCalled = false;
  stubMethod(t, CreditPurchase, "findOne", async () => ({
    _id: "p1",
    userId: USER_ID,
    paypalOrderId: "ORDER-1",
    status: "captured",
  }));
  stubMethod(t, paypal, "captureOrder", async () => {
    paypalCalled = true;
    throw new Error("must not be called");
  });
  stubMethod(t, creditsService, "getBalance", async () => 150);
  const { request } = await startApp(t, creditsRouter, "/api/credits");
  const res = await request("POST", "/api/credits/capture-order", {
    orderId: "ORDER-1",
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.alreadyCaptured, true);
  assert.equal(res.json.credits, 150);
  assert.equal(paypalCalled, false);
});

test("H2: ORDER_ALREADY_CAPTURED recovers by applying the order's completed capture", async (t) => {
  authStubs(t);
  const purchase = {
    _id: "p1",
    userId: USER_ID,
    paypalOrderId: "ORDER-1",
    packId: "starter",
    credits: 50,
    amountCents: 500,
    status: "pending",
  };
  stubMethod(t, CreditPurchase, "findOne", async () => purchase);
  const alreadyCapturedErr = new Error("Order already captured");
  alreadyCapturedErr.response = {
    status: 422,
    data: { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] },
  };
  stubMethod(t, paypal, "captureOrder", async () => {
    throw alreadyCapturedErr;
  });
  stubMethod(t, paypal, "getAccessToken", async () => "fake-token");
  const origAxiosGet = axios.get;
  axios.get = async (url) => {
    assert.match(url, /\/v2\/checkout\/orders\/ORDER-1$/);
    return {
      data: {
        status: "COMPLETED",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "5.00" },
            payments: {
              captures: [
                {
                  id: "CAP-1",
                  status: "COMPLETED",
                  amount: { currency_code: "USD", value: "5.00" },
                },
              ],
            },
          },
        ],
      },
    };
  };
  t.after(() => {
    axios.get = origAxiosGet;
  });
  let claimFilter = null;
  stubMethod(t, CreditPurchase, "findOneAndUpdate", async (filter) => {
    claimFilter = filter;
    return { ...purchase, status: "captured" };
  });
  stubMethod(t, User, "findByIdAndUpdate", () => ({
    select: async () => ({ creditBalance: 250 }),
  }));
  const { request } = await startApp(t, creditsRouter, "/api/credits");
  const res = await request("POST", "/api/credits/capture-order", {
    orderId: "ORDER-1",
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.recovered, true);
  assert.equal(res.json.alreadyCaptured, false);
  assert.equal(res.json.credits, 250);
  // The exactly-once claim still guards the crediting.
  assert.deepEqual(claimFilter, {
    _id: "p1",
    userId: USER_ID,
    status: "pending",
  });
});
