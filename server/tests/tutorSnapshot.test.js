// Tutor snapshot cap (AI/data M7, slice 16). Pure-unit tests: the
// builder takes no database or network.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMessagesSnapshot,
  MAX_SNAPSHOT_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_SNAPSHOT_CHARS,
} = require("../services/tutorSnapshot");

const user = (content, extra = {}) => ({ role: "user", content, ...extra });
const assistant = (content, extra = {}) => ({
  role: "assistant",
  content,
  ...extra,
});

test("a short conversation passes through in order, unchanged", () => {
  const out = buildMessagesSnapshot(
    [user("Hello"), assistant("Hi there")],
    assistant("Ask me anything", { followUps: ["a", "b"] }),
  );
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((m) => m.content),
    ["Hello", "Hi there", "Ask me anything"],
  );
  assert.deepEqual(out[2].followUps, ["a", "b"]);
});

test("empty messages and non-conversation roles are dropped", () => {
  const out = buildMessagesSnapshot(
    [user("   "), { role: "system", content: "prompt" }, user("real")],
    assistant("answer"),
  );
  assert.deepEqual(
    out.map((m) => m.content),
    ["real", "answer"],
  );
});

test("each message is truncated to exactly the per-message cap", () => {
  const out = buildMessagesSnapshot(
    [user("x".repeat(20000))],
    assistant("ok"),
  );
  assert.equal(out[0].content.length, MAX_MESSAGE_CHARS);
  assert.equal(out[1].content, "ok");
});

test("follow-ups are capped at three per message", () => {
  const out = buildMessagesSnapshot(
    [],
    assistant("answer", { followUps: ["1", "2", "3", "4", "5"] }),
  );
  assert.deepEqual(out[0].followUps, ["1", "2", "3"]);
});

test("the message count never exceeds the snapshot cap", () => {
  const history = Array.from({ length: 80 }, (_, i) => user(`m${i}`));
  const out = buildMessagesSnapshot(history, assistant("last"));
  assert.equal(out.length, MAX_SNAPSHOT_MESSAGES);
  assert.equal(out[out.length - 1].content, "last");
  assert.equal(out[0].content, "m31");
});

test("the total budget keeps the newest messages and drops the oldest", () => {
  const history = Array.from({ length: 11 }, (_, i) => {
    const label = `u${i}-`;
    return user(label + "x".repeat(MAX_MESSAGE_CHARS - label.length));
  });
  // 11 history messages of 12,000 chars + the assistant reply would
  // be 132,005 chars; the budget is 120,000, so the snapshot holds
  // the 9 newest history messages plus the reply.
  const out = buildMessagesSnapshot(history, assistant("reply"));
  const total = out.reduce((sum, m) => sum + m.content.length, 0);
  assert.ok(total <= MAX_SNAPSHOT_CHARS);
  assert.equal(out[out.length - 1].content, "reply");
  assert.equal(out.length, 10);
  assert.ok(out[0].content.startsWith("u2-"));
});

test("a createdAt that parses is preserved; a bad one is dropped", () => {
  const stamp = new Date("2026-10-27T10:00:00.000Z");
  const out = buildMessagesSnapshot(
    [user("hi", { createdAt: stamp }), user("bad", { createdAt: "not a date" })],
    assistant("answer"),
  );
  assert.equal(out[0].createdAt.getTime(), stamp.getTime());
  assert.equal(out[1].createdAt, undefined);
});
