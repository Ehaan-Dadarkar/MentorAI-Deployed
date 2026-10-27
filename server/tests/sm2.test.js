// SM-2 caps and input sanitisation (AI/data M11, slice 15).
// Pure-unit tests: calculateSM2 takes no database or network.
const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateSM2 } = require("../services/sm2");

test("NaN and infinite grades are rejected, not passed through", () => {
  assert.throws(() => calculateSM2({ grade: NaN }), /grade must be/);
  assert.throws(() => calculateSM2({ grade: Infinity }), /grade must be/);
  assert.throws(() => calculateSM2({ grade: -Infinity }), /grade must be/);
});

test("classic first-pass sequence is unchanged", () => {
  const first = calculateSM2({ grade: "got_it" });
  assert.equal(first.interval, 1);
  assert.equal(first.repetitions, 1);
  const second = calculateSM2({
    easeFactor: first.easeFactor,
    interval: first.interval,
    repetitions: first.repetitions,
    grade: "got_it",
  });
  assert.equal(second.interval, 6);
  assert.equal(second.repetitions, 2);
});

test("ease factor never exceeds its starting value", () => {
  const out = calculateSM2({ easeFactor: 2.5, grade: 5 });
  assert.equal(out.easeFactor, 2.5);
  const high = calculateSM2({ easeFactor: 9, grade: 5 });
  assert.equal(high.easeFactor, 2.5);
});

test("ease factor floor is preserved", () => {
  const out = calculateSM2({ easeFactor: 1.3, grade: 3 });
  assert.ok(out.easeFactor >= 1.3);
});

test("interval is capped at 365 days", () => {
  const out = calculateSM2({
    easeFactor: 2.5,
    interval: 300,
    repetitions: 5,
    grade: 5,
  });
  assert.equal(out.interval, 365);
  const days = Math.round(
    (out.nextReview - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000,
  );
  assert.equal(days, 365);
});

test("NaN and non-finite stored fields fall back to defaults, never NaN", () => {
  const out = calculateSM2({
    easeFactor: NaN,
    interval: NaN,
    repetitions: NaN,
    grade: "got_it",
  });
  assert.equal(out.interval, 1);
  assert.equal(out.repetitions, 1);
  assert.equal(out.easeFactor, 2.5);
  assert.ok(Number.isFinite(out.nextReview.getTime()));
  const inf = calculateSM2({
    easeFactor: Infinity,
    interval: Infinity,
    repetitions: Infinity,
    grade: 5,
  });
  assert.ok(Number.isFinite(inf.interval));
  assert.ok(Number.isFinite(inf.easeFactor));
  assert.ok(Number.isFinite(inf.repetitions));
  assert.ok(inf.interval <= 365);
});

test("a failed grade still resets to a 1-day interval", () => {
  const out = calculateSM2({
    easeFactor: 2.5,
    interval: 200,
    repetitions: 9,
    grade: "missed",
  });
  assert.equal(out.interval, 1);
  assert.equal(out.repetitions, 0);
});
