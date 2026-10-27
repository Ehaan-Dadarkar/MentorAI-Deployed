// Credit-gate wiring (item 9a, slice 12): the gate in
// openrouterAccess.js decides which provider key a request may use
// and spends credits for the keyless, non-demo path. No database is
// connected here: User.findById and the credits-service balance
// methods are stubbed per test, so these assert the gate's own
// decisions, not MongoDB behaviour. Fake keys only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../models/User");
const credits = require("../services/credits");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");

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

// Stubs User.findById for one test: the gate calls
// findById(id).select(...), so the stub must return the query-like
// object with a select method.
function stubUser(t, docById) {
  const original = User.findById;
  User.findById = (id) => ({
    select: async () => (id in docById ? docById[id] : null),
  });
  t.after(() => {
    User.findById = original;
  });
}

function stubCredits(t, { balance, spendResult }) {
  const calls = { getBalance: [], spend: [] };
  const origBalance = credits.getBalance;
  const origSpend = credits.spendCredits;
  credits.getBalance = async (userId) => {
    calls.getBalance.push(userId);
    return balance;
  };
  credits.spendCredits = async (userId, amount) => {
    calls.spend.push([userId, amount]);
    return spendResult;
  };
  t.after(() => {
    credits.getBalance = origBalance;
    credits.spendCredits = origSpend;
  });
  return calls;
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

const ownKeyUser = { _id: "user-own", isDemo: false, openrouterApiKey: "own-key" };
const demoUser = { _id: "user-demo", isDemo: true, openrouterApiKey: null };
const keylessUser = { _id: "user-keyless", isDemo: false, openrouterApiKey: null };

test("own-key user gets their own key and is never charged", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  withEnv(t, "CREDITS_PER_AI_CALL", undefined);
  stubUser(t, { "user-own": ownKeyUser });
  const calls = stubCredits(t, { balance: 99, spendResult: 98 });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-own" } }, res);
  assert.equal(access.apiKey, "own-key");
  assert.equal(access.creditFunded, false);
  assert.equal(calls.getBalance.length, 0);
  assert.equal(calls.spend.length, 0);
  assert.equal(res.statusCode, null);
});

test("demo user gets the shared key and is never charged", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  stubUser(t, { "user-demo": demoUser });
  const calls = stubCredits(t, { balance: 99, spendResult: 98 });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-demo" } }, res);
  assert.equal(access.apiKey, "shared-key");
  assert.equal(access.creditFunded, false);
  assert.equal(calls.spend.length, 0);
});

test("keyless user with balance spends 1 credit and gets the shared key", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  withEnv(t, "CREDITS_PER_AI_CALL", undefined);
  stubUser(t, { "user-keyless": keylessUser });
  const calls = stubCredits(t, { balance: 5, spendResult: 4 });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-keyless" } }, res);
  assert.equal(access.apiKey, "shared-key");
  assert.equal(access.creditFunded, true);
  assert.equal(access.creditsSpent, 1);
  assert.equal(access.creditBalance, 4);
  assert.deepEqual(calls.spend, [["user-keyless", 1]]);
});

test("keyless user without enough credits gets 402 and is not charged", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  withEnv(t, "CREDITS_PER_AI_CALL", undefined);
  stubUser(t, { "user-keyless": keylessUser });
  const calls = stubCredits(t, { balance: 0, spendResult: null });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-keyless" } }, res);
  assert.equal(access, null);
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.credits, 0);
  assert.equal(res.body.creditsRequired, 1);
  assert.equal(calls.spend.length, 0);
});

test("keyless user with credits but no operator key gets 402 and is not charged", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", undefined);
  stubUser(t, { "user-keyless": keylessUser });
  const calls = stubCredits(t, { balance: 50, spendResult: 49 });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-keyless" } }, res);
  assert.equal(access, null);
  assert.equal(res.statusCode, 402);
  assert.equal(calls.getBalance.length, 0);
  assert.equal(calls.spend.length, 0);
});

test("a lost spend race returns 402 instead of calling the provider", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  withEnv(t, "CREDITS_PER_AI_CALL", undefined);
  stubUser(t, { "user-keyless": keylessUser });
  const calls = stubCredits(t, { balance: 1, spendResult: null });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-keyless" } }, res);
  assert.equal(access, null);
  assert.equal(res.statusCode, 402);
  assert.deepEqual(calls.spend, [["user-keyless", 1]]);
});

test("CREDITS_PER_AI_CALL override changes the spend, invalid values fall back to 1", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  withEnv(t, "CREDITS_PER_AI_CALL", "3");
  stubUser(t, { "user-keyless": keylessUser });
  const calls = stubCredits(t, { balance: 5, spendResult: 2 });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "user-keyless" } }, res);
  assert.equal(access.creditsSpent, 3);
  assert.deepEqual(calls.spend, [["user-keyless", 3]]);
  assert.equal(credits.creditCostPerAiCall(), 3);
  // Invalid values are checked by direct assignment, not nested
  // withEnv calls, so the outer restore above stays unambiguous.
  process.env.CREDITS_PER_AI_CALL = "nonsense";
  assert.equal(credits.creditCostPerAiCall(), 1);
  process.env.CREDITS_PER_AI_CALL = "0";
  assert.equal(credits.creditCostPerAiCall(), 1);
});

test("unauthenticated and unknown users get 401 and are not charged", async (t) => {
  withEnv(t, "OPENROUTER_API_KEY", "shared-key");
  stubUser(t, {});
  const calls = stubCredits(t, { balance: 50, spendResult: 49 });
  const noUser = mockRes();
  assert.equal(await requireOpenRouterAccess({}, noUser), null);
  assert.equal(noUser.statusCode, 401);
  const unknown = mockRes();
  assert.equal(await requireOpenRouterAccess({ user: { _id: "nobody" } }, unknown), null);
  assert.equal(unknown.statusCode, 401);
  assert.equal(calls.spend.length, 0);
});
