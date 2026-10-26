const UsageRecord = require("../models/UsageRecord");

function toNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

// Normalise a provider usage block into the UsageRecord shape.
// OpenRouter reports { prompt_tokens, completion_tokens, total_tokens,
// cost } (cost in USD). Unknown or malformed fields become undefined
// rather than 0, so missing data is never mistaken for free usage.
function normalizeUsage(rawUsage, model) {
  const usage = rawUsage && typeof rawUsage === "object" ? rawUsage : {};
  const promptTokens = toNonNegativeNumber(usage.prompt_tokens);
  const completionTokens = toNonNegativeNumber(usage.completion_tokens);
  let totalTokens = toNonNegativeNumber(usage.total_tokens);
  if (
    totalTokens === undefined &&
    promptTokens !== undefined &&
    completionTokens !== undefined
  ) {
    totalTokens = promptTokens + completionTokens;
  }
  return {
    model: model || usage.model || "unknown",
    promptTokens,
    completionTokens,
    totalTokens,
    cost: toNonNegativeNumber(usage.cost),
  };
}

// Persist one usage record. Metering must never break a user-facing
// request: every failure path is swallowed here (logged, not thrown),
// and a missing userId is a no-op rather than a validation error.
async function recordUsage(record) {
  try {
    if (!record || !record.userId || !record.model || !record.feature) {
      return null;
    }
    return await UsageRecord.create({
      userId: record.userId,
      provider: record.provider || "openrouter",
      model: record.model,
      feature: record.feature,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      totalTokens: record.totalTokens,
      cost: record.cost !== undefined ? record.cost : null,
    });
  } catch (error) {
    console.error("Failed to record AI usage:", error.message);
    return null;
  }
}

// Build the onUsage callback a route passes to callOpenRouter (or to
// an ai.js generator that forwards it). The callback is synchronous
// from the caller's point of view: recordUsage runs in the background
// and its failures are contained inside recordUsage.
function usageCallbackFor(userId, feature) {
  return (usage) => {
    recordUsage({
      userId,
      feature,
      provider: usage.provider || "openrouter",
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cost: usage.cost,
    });
  };
}

module.exports = {
  normalizeUsage,
  recordUsage,
  usageCallbackFor,
};
