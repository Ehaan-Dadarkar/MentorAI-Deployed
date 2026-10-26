const mongoose = require("mongoose");

// One row per AI provider request that carried usage data.
// This is the ledger the PayPal credits slice bills against: a credit
// grant or deduction is only verifiable if every chargeable request
// is recorded here with its user, model, tokens, and cost.
// No API key, prompt, or response content is ever stored here.
const usageRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["openrouter", "ollama"],
      default: "openrouter",
    },
    model: {
      type: String,
      required: true,
    },
    // Feature that triggered the request, e.g. "tutor-chat",
    // "flashcards", "quiz". Used for per-feature spend breakdowns.
    feature: {
      type: String,
      required: true,
    },
    promptTokens: {
      type: Number,
      min: 0,
    },
    completionTokens: {
      type: Number,
      min: 0,
    },
    totalTokens: {
      type: Number,
      min: 0,
    },
    // Cost in USD as reported by the provider (OpenRouter's
    // usage.cost). Null when the provider reports no cost, so that
    // "unknown" is never silently recorded as zero spend.
    cost: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

usageRecordSchema.index({ userId: 1, createdAt: -1 });
usageRecordSchema.index({ feature: 1, createdAt: -1 });

module.exports = mongoose.model("UsageRecord", usageRecordSchema);
