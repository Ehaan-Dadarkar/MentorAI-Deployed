const mongoose = require("mongoose");

const tutorSessionSummarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      default: "",
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    context: {
      type: String,
      default: "",
      trim: true,
    },
    promptPreview: {
      type: String,
      default: "",
      maxlength: 240,
    },
    responsePreview: {
      type: String,
      default: "",
      maxlength: 400,
    },
    followUps: {
      type: [String],
      default: [],
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    messagesSnapshot: {
      type: [
        {
          role: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
          },
          content: {
            type: String,
            default: "",
          },
          followUps: {
            type: [String],
            default: [],
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    selectedNoteIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Note",
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

tutorSessionSummarySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model(
  "TutorSessionSummary",
  tutorSessionSummarySchema,
);
