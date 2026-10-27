// Quiz cache keys are a SHA-256 of the full content, scoped per user
// (slice 19). The old length:head:tail fingerprint collided for contents
// differing only in the middle, and the key carried no user, so one
// user's cached quiz could be served to another user with the same
// subject/topic/content.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const router = require("../routes/quiz");
const { buildCacheKey, contentFingerprint } = router;

const base = {
  userId: "user-a",
  subject: "Biology",
  topic: "Cells",
  difficulty: "medium",
  count: 5,
  content: "Photosynthesis and cell respiration notes.",
};

test("fingerprint is the SHA-256 hex of the trimmed content", () => {
  const expected = crypto
    .createHash("sha256")
    .update("Photosynthesis and cell respiration notes.", "utf8")
    .digest("hex");
  assert.equal(contentFingerprint("  Photosynthesis and cell respiration notes.  "), expected);
  assert.match(contentFingerprint(base.content), /^[0-9a-f]{64}$/);
});

test("empty or whitespace-only content fingerprints to empty string", () => {
  assert.equal(contentFingerprint(""), "");
  assert.equal(contentFingerprint("   "), "");
  assert.equal(contentFingerprint(null), "");
});

test("contents differing only in the middle get different fingerprints and keys", () => {
  const head = "a".repeat(120);
  const tail = "b".repeat(120);
  const first = head + "X".repeat(50) + tail;
  const second = head + "Y".repeat(50) + tail;
  assert.equal(first.length, second.length);
  // Under the old length:head:tail fingerprint these two collided.
  assert.notEqual(contentFingerprint(first), contentFingerprint(second));
  assert.notEqual(
    buildCacheKey({ ...base, content: first }),
    buildCacheKey({ ...base, content: second }),
  );
});

test("identical params for the same user give an identical key", () => {
  assert.equal(buildCacheKey(base), buildCacheKey({ ...base }));
});

test("the same params for a different user give a different key", () => {
  assert.notEqual(buildCacheKey(base), buildCacheKey({ ...base, userId: "user-b" }));
});

test("a missing user id never collides with a real user id", () => {
  const { userId, ...withoutUser } = base;
  assert.notEqual(buildCacheKey(withoutUser), buildCacheKey(base));
  assert.equal(JSON.parse(buildCacheKey(withoutUser)).userId, null);
});

test("subject and topic casing still normalise, as before", () => {
  assert.equal(
    buildCacheKey(base),
    buildCacheKey({ ...base, subject: "BIOLOGY", topic: "  Cells " }),
  );
});
