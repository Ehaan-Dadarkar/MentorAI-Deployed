const mongoose = require("mongoose");

const studyLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deck",
      required: true,
      index: true,
    },
    // Stored at midnight for day-level grouping.
    date: {
      type: Date,
      required: true,
    },
    totalReviewed: {
      type: Number,
      required: true,
      min: 0,
    },
    correctCount: {
      type: Number,
      required: true,
      min: 0,
    },
    accuracy: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    reviews: [
      {
        cardId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Flashcard",
          required: true,
        },
        grade: {
          type: String,
          enum: ["missed", "almost", "got_it"],
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

studyLogSchema.index({ userId: 1, date: -1 });
studyLogSchema.index({ userId: 1, deckId: 1, date: -1 });
studyLogSchema.index({ date: 1 });

module.exports = mongoose.model("StudyLog", studyLogSchema);
