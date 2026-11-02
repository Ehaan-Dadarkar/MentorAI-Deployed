// Tutor reliability fixes (H1, H3 + pipeline items 1/8). Pure-unit tests:
// no database, no network. Axios post functions are stubbed, and the
// router module's test-exposed helpers are asserted without starting a
// server or streaming anything.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  postWithProviderRetries,
  isRetryableProviderError,
} = require("../services/ai");
const tutorRouter = require("../routes/tutor");

const statusError = (status) => {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status };
  return err;
};

// ── Pipeline item 1: shared retry helper ─────────────────────────────

test("isRetryableProviderError: 429 and 5xx retry, 4xx and network errors do not", () => {
  assert.equal(isRetryableProviderError(statusError(429)), true);
  assert.equal(isRetryableProviderError(statusError(500)), true);
  assert.equal(isRetryableProviderError(statusError(503)), true);
  assert.equal(isRetryableProviderError(statusError(400)), false);
  assert.equal(isRetryableProviderError(statusError(401)), false);
  assert.equal(isRetryableProviderError(statusError(404)), false);
  assert.equal(isRetryableProviderError(new Error("socket hang up")), false);
  const timeout = new Error("timeout of 60000ms exceeded");
  timeout.code = "ECONNABORTED";
  assert.equal(isRetryableProviderError(timeout), false);
});

test("postWithProviderRetries: succeeds first try without retrying", async () => {
  let calls = 0;
  const result = await postWithProviderRetries(async () => {
    calls += 1;
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("postWithProviderRetries: retries a 429 then returns success", async () => {
  let calls = 0;
  const result = await postWithProviderRetries(async () => {
    calls += 1;
    if (calls === 1) throw statusError(429);
    return "recovered";
  });
  assert.equal(result, "recovered");
  assert.equal(calls, 2);
});

test("postWithProviderRetries: gives up after 2 retries on persistent 5xx", async () => {
  let calls = 0;
  await assert.rejects(
    postWithProviderRetries(async () => {
      calls += 1;
      throw statusError(500);
    }),
    /Request failed with status code 500/,
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test("postWithProviderRetries: fails fast on 4xx and on timeouts (no double-charge risk)", async () => {
  let calls400 = 0;
  await assert.rejects(
    postWithProviderRetries(async () => {
      calls400 += 1;
      throw statusError(400);
    }),
    /Request failed with status code 400/,
  );
  assert.equal(calls400, 1);

  let callsTimeout = 0;
  const timeout = new Error("timeout of 60000ms exceeded");
  timeout.code = "ECONNABORTED";
  await assert.rejects(
    postWithProviderRetries(async () => {
      callsTimeout += 1;
      throw timeout;
    }),
  );
  assert.equal(callsTimeout, 1);
});

// ── H1: the /chat schema accepts long threads ────────────────────────

const makeMessages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i}`,
  }));

test("H1: chat schema accepts a 60-message thread (old max(50) rejected it)", () => {
  const parsed = tutorRouter.chatSchema.safeParse({
    messages: makeMessages(60),
  });
  assert.equal(parsed.success, true);
});

test("H1: chat schema still rejects empty histories and absurd ones", () => {
  assert.equal(
    tutorRouter.chatSchema.safeParse({ messages: [] }).success,
    false,
  );
  assert.equal(
    tutorRouter.chatSchema.safeParse({ messages: makeMessages(201) }).success,
    false,
  );
  // Message roles outside the conversation are still rejected.
  assert.equal(
    tutorRouter.chatSchema.safeParse({
      messages: [{ role: "system", content: "prompt" }],
    }).success,
    false,
  );
});

// ── H3: the zero-token refund rule ───────────────────────────────────

test("H3: shouldRefundStreamSpend refunds only when no token was delivered", () => {
  assert.equal(tutorRouter.shouldRefundStreamSpend(0), true);
  assert.equal(tutorRouter.shouldRefundStreamSpend(1), false);
  assert.equal(tutorRouter.shouldRefundStreamSpend(47), false);
});
