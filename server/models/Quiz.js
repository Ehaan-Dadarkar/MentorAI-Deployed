const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: Number, required: true },
    userAnswer: { type: Number, default: null },
    explanation: { type: String, default: "" },
    topic: { type: String, default: "" },
  },
  { _id: false },
);

const quizSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    deckName: {
      type: String,
      default: "",
      trim: true,
    },
    deckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deck",
      default: null,
      index: true,
    },
    questions: {
      type: [questionSchema],
      required: true,
    },
    score: {
      type: Number,
      default: null,
    },
    timeTaken: {
      type: Number,
      default: null,
    },
    weakTopics: {
      type: [String],
      default: [],
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

quizSchema.index({ userId: 1, completedAt: -1 });
quizSchema.index({ userId: 1, deckName: 1, createdAt: -1 });

module.exports = mongoose.model("Quiz", quizSchema);
