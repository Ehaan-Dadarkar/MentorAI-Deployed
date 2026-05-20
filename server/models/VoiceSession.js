const mongoose = require("mongoose");

const voiceResponseSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    expectedConcepts: { type: [String], default: [] },
    userResponse: { type: String, default: "" },
    score: { type: Number, default: 0, min: 0, max: 100 },
    feedback: { type: String, default: "" },
  },
  { _id: false },
);

const voiceSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    noteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      default: null,
    },
    subject: {
      type: String,
      default: "",
    },
    questions: {
      type: [String],
      default: [],
    },
    responses: {
      type: [voiceResponseSchema],
      default: [],
    },
    avgScore: {
      type: Number,
      default: 0,
    },
    weakConcepts: {
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

voiceSessionSchema.index({ userId: 1, completedAt: -1 });

module.exports = mongoose.model("VoiceSession", voiceSessionSchema);
