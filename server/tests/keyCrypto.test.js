// Key encryption at rest (AI/data M8, slice 18): AES-256-GCM around
// stored user OpenRouter keys. No database is connected here: the
// gate tests stub User.findById the same way creditGate.test.js does.
// Fake keys only, in memory; the encryption key is generated fresh
// per test and never written to any file.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { getEncryptionKey, isEncrypted, encryptKey, decryptKey } = require("../services/keyCrypto");
const User = require("../models/User");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");

const FAKE_KEY = "sk-or-fake-key-for-tests-only-123456";

function setEnv(t, key, value) {
  const had = key in process.env;
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (had) process.env[key] = prev;
    else delete process.env[key];
  });
}

function hexKey() {
  return crypto.randomBytes(32).toString("hex");
}

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

test("round trip: encrypt then decrypt returns the key, ciphertext differs each time", (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", hexKey());
  const enc1 = encryptKey(FAKE_KEY);
  const enc2 = encryptKey(FAKE_KEY);
  assert.equal(isEncrypted(enc1), true);
  assert.notEqual(enc1, enc2);
  assert.equal(enc1.includes(FAKE_KEY), false);
  assert.equal(decryptKey(enc1), FAKE_KEY);
  assert.equal(decryptKey(enc2), FAKE_KEY);
});

test("base64 key form works, and an invalid key form yields no key", (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
  assert.equal(decryptKey(encryptKey(FAKE_KEY)), FAKE_KEY);
  // Direct assignment, not a second setEnv (see the tamper test).
  process.env.KEY_ENCRYPTION_KEY = "too-short";
  assert.equal(getEncryptionKey(), null);
});

test("without a key configured, encrypt/decrypt are plaintext passthrough", (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", undefined);
  assert.equal(encryptKey(FAKE_KEY), FAKE_KEY);
  assert.equal(decryptKey(FAKE_KEY), FAKE_KEY);
});

test("legacy plaintext rows still decrypt (passthrough) after a key is set", (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", hexKey());
  assert.equal(decryptKey(FAKE_KEY), FAKE_KEY);
});

test("tampered ciphertext, wrong key, and malformed prefix all decrypt to null", (t) => {
  const goodKey = hexKey();
  setEnv(t, "KEY_ENCRYPTION_KEY", goodKey);
  const enc = encryptKey(FAKE_KEY);
  const parts = enc.split(":");
  const tampered = [parts[0], parts[1], parts[2], "00".repeat(8)].join(":");
  assert.equal(decryptKey(tampered), null);
  assert.equal(decryptKey("enc:v1:deadbeef"), null);
  assert.equal(decryptKey("enc:v1:not-hex:not-hex:not-hex"), null);
  // Direct assignment, not a second setEnv: the first setEnv's single
  // restore returns the variable to its pre-test value exactly once.
  process.env.KEY_ENCRYPTION_KEY = hexKey();
  assert.equal(decryptKey(enc), null);
});

test("encrypted value without the key configured decrypts to null, not to ciphertext", (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", hexKey());
  const enc = encryptKey(FAKE_KEY);
  // Direct deletion, not a second setEnv (see the tamper test).
  delete process.env.KEY_ENCRYPTION_KEY;
  assert.equal(decryptKey(enc), null);
});

test("empty and null values pass through untouched", (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", hexKey());
  assert.equal(encryptKey(""), "");
  assert.equal(encryptKey(null), null);
  assert.equal(decryptKey(""), "");
  assert.equal(decryptKey(null), null);
});

test("gate decrypts a stored encrypted key and returns the plaintext", async (t) => {
  const key = hexKey();
  setEnv(t, "KEY_ENCRYPTION_KEY", key);
  setEnv(t, "OPENROUTER_API_KEY", undefined);
  const stored = encryptKey(FAKE_KEY);
  const original = User.findById;
  User.findById = () => ({
    select: async () => ({ _id: "u1", isDemo: false, openrouterApiKey: stored }),
  });
  t.after(() => {
    User.findById = original;
  });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "u1" } }, res);
  assert.equal(res.statusCode, null);
  assert.equal(access.apiKey, FAKE_KEY);
  assert.equal(access.creditFunded, false);
});

test("gate treats an undecryptable stored key as no key (402, no provider key)", async (t) => {
  setEnv(t, "KEY_ENCRYPTION_KEY", hexKey());
  const stored = encryptKey(FAKE_KEY);
  // Direct assignment, not a second setEnv (see the tamper test):
  // the stored row was encrypted under a different key, so the gate
  // must not be able to use it.
  process.env.KEY_ENCRYPTION_KEY = hexKey();
  setEnv(t, "OPENROUTER_API_KEY", undefined);
  const original = User.findById;
  User.findById = () => ({
    select: async () => ({ _id: "u1", isDemo: false, openrouterApiKey: stored }),
  });
  t.after(() => {
    User.findById = original;
  });
  const res = mockRes();
  const access = await requireOpenRouterAccess({ user: { _id: "u1" } }, res);
  assert.equal(access, null);
  assert.equal(res.statusCode, 402);
});
