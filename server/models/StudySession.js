const mongoose = require("mongoose");

const studySessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["flashcard", "quiz", "voice", "tutor"],
      required: true,
    },
    subject: {
      type: String,
      default: "General",
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

studySessionSchema.index({ userId: 1, date: -1 });
studySessionSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model("StudySession", studySessionSchema);
