const mongoose = require("mongoose");

const flashcardSchema = new mongoose.Schema(
  {
    deckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deck",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    mastery: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // SM-2 algorithm fields
    interval: {
      type: Number,
      default: 1,
    },
    repetitions: {
      type: Number,
      default: 0,
    },
    easeFactor: {
      type: Number,
      default: 2.5,
    },
    nextReview: {
      type: Date,
      default: Date.now,
    },
    lastReviewed: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

flashcardSchema.index({ deckId: 1, nextReview: 1 });
flashcardSchema.index({ userId: 1, nextReview: 1 });
// Index for mastery stats aggregation queries
flashcardSchema.index({ userId: 1, deckId: 1, mastery: 1 });

module.exports = mongoose.model("Flashcard", flashcardSchema);
