const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    subjects: {
      type: [String],
      default: [],
    },
    studyGoalMinutes: {
      type: Number,
      default: 60,
      min: 5,
      max: 720,
    },
    streak: {
      type: Number,
      default: 0,
    },
    lastStudyDate: {
      type: Date,
      default: null,
    },
    weakTopics: {
      type: [String],
      default: [],
    },
    openrouterApiKey: {
      type: String,
      default: "",
      trim: true,
      select: false,
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 });

module.exports = mongoose.model("User", userSchema);
