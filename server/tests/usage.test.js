// Usage/cost metering (AI/data M9, slice 3).
// Pure-unit tests: no database is connected here, so the only
// recordUsage paths exercised are the ones that must return null
// without touching the database. A database-backed write (a real
// request persisting a real UsageRecord row) is still owed before
// the PayPal slice relies on this ledger.
const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeUsage, recordUsage, usageCallbackFor } = require("../services/usage");

test("normalizeUsage keeps tokens and cost from the provider block", () => {
  const out = normalizeUsage(
    { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.001 },
    "model-x",
  );
  assert.equal(out.promptTokens, 10);
  assert.equal(out.completionTokens, 5);
  assert.equal(out.totalTokens, 15);
  assert.equal(out.cost, 0.001);
  assert.equal(out.model, "model-x");
});

test("normalizeUsage derives total from prompt + completion when absent", () => {
  const out = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5 }, "model-x");
  assert.equal(out.totalTokens, 15);
});

test("normalizeUsage never reports missing or malformed values as 0", () => {
  const out = normalizeUsage({ prompt_tokens: -1, completion_tokens: "nope" }, "model-x");
  assert.equal(out.promptTokens, undefined);
  assert.equal(out.completionTokens, undefined);
  assert.equal(out.totalTokens, undefined);
  assert.equal(out.cost, undefined);
  const empty = normalizeUsage(undefined, undefined);
  assert.equal(empty.model, "unknown");
  assert.equal(empty.totalTokens, undefined);
});

test("recordUsage returns null without a user, model, or feature — never throws", async () => {
  assert.equal(await recordUsage(null), null);
  assert.equal(await recordUsage({ model: "m", feature: "f" }), null);
  assert.equal(await recordUsage({ userId: "u", feature: "f" }), null);
  assert.equal(await recordUsage({ userId: "u", model: "m" }), null);
});

test("usageCallbackFor never throws when the usage block has no model", () => {
  const cb = usageCallbackFor("user-1", "tutor-chat");
  assert.doesNotThrow(() => cb({ promptTokens: 1 }));
});
