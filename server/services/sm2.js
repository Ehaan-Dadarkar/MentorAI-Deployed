function normalizeGrade(grade) {
  if (typeof grade === "number") {
    if (grade < 0 || grade > 5) {
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

  let nextEaseFactor = easeFactor;
  let nextInterval = interval;
  let nextRepetitions = repetitions;

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
