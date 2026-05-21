const User = require("../models/User");

function resolveApiKey(user) {
  if (!user) return null;

  if (user.isDemo) {
    return process.env.OPENROUTER_API_KEY || null;
  }

  if (user.openrouterApiKey) {
    return user.openrouterApiKey;
  }

  return null;
}

async function requireOpenRouterAccess(req, res) {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  }

  const user = await User.findById(userId).select("+openrouterApiKey isDemo");

  if (!user) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return null;
  }

  const apiKey = resolveApiKey(user);
  if (!apiKey) {
    res.status(402).json({
      success: false,
      error: "No API key configured. Please add your OpenRouter API key in Settings.",
    });
    return null;
  }

  return { user, apiKey };
}

module.exports = {
  resolveApiKey,
  requireOpenRouterAccess,
};