// Credit refund on failed AI requests (slice 13): the gate spends up
// front, and a credit-funded non-streaming request that delivers no
// AI result gives the spend back via refundCreditSpend(req). No
// database is connected here: User methods and the credits-service
// methods are stubbed per test, so these assert the refund mechanics,
// not MongoDB behaviour. Fake keys only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../models/User");
const credits = require("../services/credits");
const {
  requireOpenRouterAccess,
  refundCreditSpend,
} = require("../services/openrouterAccess");

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function withEnv(t, key, value) {
  const had = key in process.env;
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (had) process.env[key] = previous;
    else delete process.env[key];
  });
}

function stubUser(t, docById) {
  const original = User.findById;
  User.findById = (id) => ({
    select: async () => (id in docById ? docById[id] : null),
  });
  t.after(() => {
    User.findById = original;
  });
}

const keylessUser = { _id: "user-keyless", isDemo: false, openrouterApiKey: null };
const ownKeyUser = { _id: "user-own", isDemo: false, openrouterApiKey: "own-key" };

test("gate records the spend on req.creditSpend for keyless users only", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  withEnv(t, "CREDITS_PER_AI_CALL", undefined);
  stubUser(t, { "user-keyless": keylessUser, "user-own": ownKeyUser });
  const origBalance = credits.getBalance;
  const origSpend = credits.spendCredits;
  credits.getBalance = async () => 5;
  credits.spendCredits = async () => 4;
  t.after(() => {
    credits.getBalance = origBalance;
    credits.spendCredits = origSpend;
  });

  const keylessReq = { user: { _id: "user-keyless" } };
  const access = await requireOpenRouterAccess(keylessReq, mockRes());
  assert.equal(access.creditFunded, true);
  assert.deepEqual(keylessReq.creditSpend, { userId: "user-keyless", amount: 1 });

  const ownReq = { user: { _id: "user-own" } };
  const ownAccess = await requireOpenRouterAccess(ownReq, mockRes());
  assert.equal(ownAccess.creditFunded, false);
  assert.equal(ownReq.creditSpend, undefined);
});

test("refundCreditSpend refunds once, then the token is gone", async (t) => {
  const origRefund = credits.refundCredits;
  const calls = [];
  credits.refundCredits = async (userId, amount) => {
    calls.push([userId, amount]);
    return 6;
  };
  t.after(() => {
    credits.refundCredits = origRefund;
  });

  const req = { creditSpend: { userId: "user-keyless", amount: 1 } };
  assert.equal(await refundCreditSpend(req), 6);
  assert.deepEqual(calls, [["user-keyless", 1]]);
  assert.equal(req.creditSpend, null);
  assert.equal(await refundCreditSpend(req), null);
  assert.equal(calls.length, 1);
});

test("refundCreditSpend without a spend is a no-op", async (t) => {
  const origRefund = credits.refundCredits;
  let called = 0;
  credits.refundCredits = async () => {
    called += 1;
    return 6;
  };
  t.after(() => {
    credits.refundCredits = origRefund;
  });

  assert.equal(await refundCreditSpend({}), null);
  assert.equal(await refundCreditSpend(null), null);
  assert.equal(called, 0);
});

test("refundCreditSpend swallows a refund failure instead of throwing", async (t) => {
  const origRefund = credits.refundCredits;
  const origError = console.error;
  console.error = () => {};
  credits.refundCredits = async () => {
    throw new Error("db down");
  };
  t.after(() => {
    credits.refundCredits = origRefund;
    console.error = origError;
  });

  const req = { creditSpend: { userId: "user-keyless", amount: 1 } };
  assert.equal(await refundCreditSpend(req), null);
  assert.equal(req.creditSpend, null);
});

test("refundCredits increments the balance and rejects bad amounts", async (t) => {
  const origUpdate = User.findByIdAndUpdate;
  const calls = [];
  User.findByIdAndUpdate = (filter, update) => {
    calls.push([filter, update]);
    return { select: async () => ({ creditBalance: 6 }) };
  };
  t.after(() => {
    User.findByIdAndUpdate = origUpdate;
  });

  assert.equal(await credits.refundCredits("user-keyless", 1), 6);
  assert.deepEqual(calls, [[
    "user-keyless",
    { $inc: { creditBalance: 1 } },
  ]]);
  assert.equal(await credits.refundCredits("user-keyless", 0), null);
  assert.equal(await credits.refundCredits("user-keyless", NaN), null);
  assert.equal(calls.length, 1);
});
