// AI input caps, timeouts and retries (AI/data M1, M6, slice 8)
// plus the voice-recall evaluation key path (AI/data C2, slice 6).
// The provider HTTP call is stubbed (fake keys only, in memory);
// no network and no database are involved. NODE_ENV=production is
// set before requiring ai.js so the evaluation path routes to
// OpenRouter, exactly as it does in production.
process.env.NODE_ENV = "production";

const test = require("node:test");
const assert = require("node:assert/strict");

// Same bare specifier ai.js uses, so this is the same axios object.
const axios = require("axios");
const ai = require("../services/ai");

function stubPost(t, impl) {
  const original = axios.post;
  axios.post = impl;
  t.after(() => {
    axios.post = original;
  });
}

function okResponse(content, usage) {
  return {
    data: {
      choices: [{ message: { content } }],
      model: "model-x",
      usage: usage || { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.001 },
    },
  };
}

function errorWithStatus(status) {
  const err = new Error(`provider ${status}`);
  err.response = { status, data: { error: "boom" } };
  return err;
}

test("callOpenRouter retries 429/5xx up to twice, fires onUsage once, and returns content", async (t) => {
  let calls = 0;
  let seenUsage = null;
  stubPost(t, async () => {
    calls += 1;
    if (calls < 3) throw errorWithStatus(500);
    return okResponse("hello");
  });
  const content = await ai.callOpenRouter([{ role: "user", content: "hi" }], {
    apiKey: "sk-fake-test-key",
    onUsage: (u) => {
      seenUsage = u;
    },
  });
  assert.equal(content, "hello");
  assert.equal(calls, 3);
  assert.equal(seenUsage.totalTokens, 15);
  assert.equal(seenUsage.cost, 0.001);
});

test("callOpenRouter does not retry a 400, and does not retry a timeout", async (t) => {
  let calls = 0;
  stubPost(t, async () => {
    calls += 1;
    throw errorWithStatus(400);
  });
  await assert.rejects(
    ai.callOpenRouter([{ role: "user", content: "hi" }], { apiKey: "sk-fake-test-key" }),
    /AI service temporarily unavailable/,
  );
  assert.equal(calls, 1);

  calls = 0;
  stubPost(t, async () => {
    calls += 1;
    const err = new Error("timeout");
    err.code = "ECONNABORTED";
    throw err;
  });
  await assert.rejects(
    ai.callOpenRouter([{ role: "user", content: "hi" }], { apiKey: "sk-fake-test-key" }),
    /AI service temporarily unavailable/,
  );
  assert.equal(calls, 1);
});

test("callOpenRouter sends a 60 s timeout", async (t) => {
  let seenTimeout;
  stubPost(t, async (_url, _body, config) => {
    seenTimeout = config.timeout;
    return okResponse("ok");
  });
  await ai.callOpenRouter([{ role: "user", content: "hi" }], { apiKey: "sk-fake-test-key" });
  assert.equal(seenTimeout, 60000);
});

test("generateFlashcards truncates a 20 000-char input to exactly 12 000 chars", async (t) => {
  let sentContent;
  stubPost(t, async (_url, body) => {
    sentContent = body.messages.at(-1).content;
    return okResponse(JSON.stringify({ flashcards: [{ question: "q", answer: "a", difficulty: "easy" }] }));
  });
  const cards = await ai.generateFlashcards("x".repeat(20000), "Subject", 1, {
    apiKey: "sk-fake-test-key",
  });
  assert.equal(cards.length, 1);
  const userText = sentContent.split("Content:\n")[1];
  assert.equal(userText.length, 12000);
});

test("evaluateVoiceAnswer forwards the key as the Bearer header and parses the score", async (t) => {
  let seenAuth;
  stubPost(t, async (_url, _body, config) => {
    seenAuth = config.headers.Authorization;
    return okResponse(
      JSON.stringify({ score: 80, verdict: "good", whatWasCorrect: "", whatWasMissed: [], improvement: "", encouragement: "", speechCorrections: [] }),
    );
  });
  const out = await ai.evaluateVoiceAnswer("q?", ["point"], "spoken answer", 4, {
    apiKey: "sk-fake-test-key",
  });
  assert.equal(seenAuth, "Bearer sk-fake-test-key");
  assert.equal(out.score, 80);
});

test("evaluateVoiceAnswer without a key fails at the service level (the route gate turns this into a 402)", async (t) => {
  stubPost(t, async () => okResponse("{}"));
  await assert.rejects(
    ai.evaluateVoiceAnswer("q?", ["point"], "answer", 4, {}),
    /No API key configured/,
  );
});
