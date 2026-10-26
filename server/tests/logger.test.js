// Logger masking (AI/data M2, slice 5). A fake key value is used
// only in memory; nothing here is a real credential.
const test = require("node:test");
const assert = require("node:assert/strict");

const { maskSensitive } = require("../middleware/logger");

const FAKE_KEY = "sk-fake-key-for-tests-only";

test("masks the two audit leak fields apiKey and openrouterApiKey", () => {
  const out = maskSensitive({ apiKey: FAKE_KEY, openrouterApiKey: FAKE_KEY });
  assert.equal(out.apiKey, "[Redacted]");
  assert.equal(out.openrouterApiKey, "[Redacted]");
  assert.ok(!JSON.stringify(out).includes(FAKE_KEY));
});

test("masks by substring: snake_case, password, token, secret, auth, cookie", () => {
  const out = maskSensitive({
    openrouter_api_key: FAKE_KEY,
    password: "pw",
    Authorization: "Bearer x",
    jwt_secret: "s",
    sessionCookie: "c",
  });
  for (const value of Object.values(out)) assert.equal(value, "[Redacted]");
});

test("masks nested key fields and leaves benign fields alone", () => {
  const out = maskSensitive({
    body: { apiKey: FAKE_KEY, subject: "Physics" },
    count: 3,
  });
  assert.equal(out.body.apiKey, "[Redacted]");
  assert.equal(out.body.subject, "Physics");
  assert.equal(out.count, 3);
});
