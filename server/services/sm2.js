const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 2.5;
const DEFAULT_EASE_FACTOR = 2.5;
const MAX_INTERVAL_DAYS = 365;

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeGrade(grade) {
  if (typeof grade === "number") {
    if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
      throw new Error("grade must be between 0 and 5");
    }
    return grade;
  }

  const mapped = {
    missed: 1,
    almost: 3,
    got_it: 5,
  }[grade];

  if (typeof mapped !== "number") {
    throw new Error("grade must be 0-5 or one of: missed, almost, got_it");
  }

  return mapped;
}

function calculateSM2({
  easeFactor = 2.5,
  interval = 1,
  repetitions = 0,
  grade,
}) {
  const numericGrade = normalizeGrade(grade);

  // Audit M11: sanitise stored inputs before any arithmetic, so a NaN or
  // non-finite value saved on a card can never poison the next review.
  // Non-finite inputs fall back to the defaults; ease factor is clamped
  // to [1.3, 2.5] and repetitions floored to a non-negative integer.
  const startEaseFactor = Math.min(
    MAX_EASE_FACTOR,
    Math.max(MIN_EASE_FACTOR, finiteOr(easeFactor, DEFAULT_EASE_FACTOR)),
  );
  const startInterval = Math.max(0, Math.floor(finiteOr(interval, 1)));
  const startRepetitions = Math.max(0, Math.floor(finiteOr(repetitions, 0)));

  let nextEaseFactor = startEaseFactor;
  let nextInterval = startInterval;
  let nextRepetitions = startRepetitions;

  // If grade < 3 (failed), reset progress and schedule for immediate review
  if (numericGrade < 3) {
    nextRepetitions = 0;
    nextInterval = 1;
  } else {
    // Determine spacing: 1 day for first pass, 6 days for second, then exponential
    if (nextRepetitions === 0) {
      nextInterval = 1;
    } else if (nextRepetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(nextInterval * nextEaseFactor);
    }

    // Adjust difficulty factor based on answer quality
    // Higher grades decrease difficulty penalty
    nextEaseFactor = Math.max(
      1.3,
      nextEaseFactor +
        0.1 -
        (5 - numericGrade) * (0.08 + (5 - numericGrade) * 0.02),
    );

    nextRepetitions += 1;
  }

  // Audit M11: cap the schedule. Without this, repeated perfect
  // recalls multiply the interval by the ease factor without bound
  // (intervals exploding into years) and push the ease factor past
  // its starting value. The cap only bites on cards that would
  // otherwise be scheduled more than a year out.
  nextEaseFactor = Math.min(
    MAX_EASE_FACTOR,
    Math.max(MIN_EASE_FACTOR, nextEaseFactor),
  );
  nextInterval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, nextInterval));

  const nextReview = new Date();
  nextReview.setHours(0, 0, 0, 0);
  nextReview.setDate(nextReview.getDate() + nextInterval);

  return {
    interval: nextInterval,
    repetitions: nextRepetitions,
    easeFactor: nextEaseFactor,
    nextReview,
  };
}

module.exports = {
  calculateSM2,
};
