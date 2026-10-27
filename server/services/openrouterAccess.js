const User = require("../models/User");
const credits = require("./credits");

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

// Resolves which provider key a request may use, and — for the
// credit-funded path — spends the credits for it.
//
// Access order (first match wins, so no path can double-charge):
//   1. Demo users: the shared env key, never charged (demo accounts
//      cannot buy credits, so a demo balance is never spent).
//   2. Users with their own key: their key, never charged. Buying
//      credits does not change anything for them.
//   3. Keyless, non-demo users with a sufficient credit balance:
//      the shared env key, charged up front at
//      credits.creditCostPerAiCall() per request. The spend happens
//      here, inside the gate, so every route that already calls this
//      function is gated without per-route edits — a route cannot
//      forget to charge. The spend is recorded on req.creditSpend
//      so the route can give it back: every non-streaming route
//      calls refundCreditSpend(req) when the request fails before
//      delivering an AI result (thrown error, or an early error
//      return after the gate). The tutor chat stream is the one
//      exception — a stream that dies mid-answer already delivered
//      part of an answer, so its charge is kept.
//   4. Everyone else: 402, unchanged in shape from before except
//      that the keyless-credit case also reports the balance and
//      the required cost, so the client can point the user at the
//      Credits page instead of only at Settings.
//
// A keyless credit user with no operator env key still gets a 402
// and is never charged: credits cannot buy provider access the
// server itself does not have.
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

  if (user.isDemo) {
    const apiKey = process.env.OPENROUTER_API_KEY || null;
    if (!apiKey) {
      res.status(402).json({
        success: false,
        error: "No API key configured. Please add your OpenRouter API key in Settings.",
      });
      return null;
    }
    return { user, apiKey, creditFunded: false };
  }

  if (user.openrouterApiKey) {
    return { user, apiKey: user.openrouterApiKey, creditFunded: false };
  }

  const sharedKey = process.env.OPENROUTER_API_KEY || null;
  if (!sharedKey) {
    res.status(402).json({
      success: false,
      error: "No API key configured. Please add your OpenRouter API key in Settings.",
    });
    return null;
  }

  const cost = credits.creditCostPerAiCall();
  let balance;
  try {
    balance = await credits.getBalance(userId);
  } catch (err) {
    console.error("Error reading credit balance", err);
    res.status(500).json({ success: false, error: "Server error" });
    return null;
  }
  if (balance === null) {
    res.status(500).json({ success: false, error: "Server error" });
    return null;
  }
  if (balance < cost) {
    res.status(402).json({
      success: false,
      error:
        "No API key configured. Add your OpenRouter API key in Settings, or buy credits to use the shared key.",
      credits: balance,
      creditsRequired: cost,
    });
    return null;
  }

  let newBalance;
  try {
    newBalance = await credits.spendCredits(userId, cost);
  } catch (err) {
    console.error("Error spending credits", err);
    res.status(500).json({ success: false, error: "Server error" });
    return null;
  }
  if (newBalance === null) {
    // Balance dropped between the check and the atomic spend
    // (concurrent request spent first): no provider call, no charge.
    res.status(402).json({
      success: false,
      error:
        "No API key configured. Add your OpenRouter API key in Settings, or buy credits to use the shared key.",
      credits: balance,
      creditsRequired: cost,
    });
    return null;
  }

  // The refund token: the route owns giving this spend back when
  // the request delivers no AI result. Only the credit-funded path
  // sets it, so demo and own-key requests are never refundable.
  req.creditSpend = { userId, amount: cost };

  return {
    user,
    apiKey: sharedKey,
    creditFunded: true,
    creditsSpent: cost,
    creditBalance: newBalance,
  };
}

// Gives back the credits this request spent, exactly once. Returns
// the new balance, or null when there was nothing to refund (no
// spend on this request, or already refunded) or the refund failed.
// A failed refund never throws: it must not mask the original error
// the route is already handling, and the balance stays short by the
// spent amount rather than the request failing twice.
async function refundCreditSpend(req) {
  const spend = req ? req.creditSpend : null;
  if (!spend) return null;
  req.creditSpend = null;
  try {
    return await credits.refundCredits(spend.userId, spend.amount);
  } catch (err) {
    console.error("Error refunding credits", err);
    return null;
  }
}

module.exports = {
  resolveApiKey,
  requireOpenRouterAccess,
  refundCreditSpend,
};
