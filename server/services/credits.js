const User = require("../models/User");
const CreditPurchase = require("../models/CreditPurchase");
const { captureAmountCents, captureIdOf } = require("./paypal");

// Server-side credit balance. The balance lives on the User document
// as creditBalance (integer credits, default 0) so spends are atomic
// single-document updates; CreditPurchase rows are the audit trail
// of where credits came from. This module is the only place that
// may change a balance, and it never trusts a client-supplied amount.

// Returns the user's current credit balance (0 when unset).
async function getBalance(userId) {
  const user = await User.findById(userId).select("creditBalance");
  if (!user) return null;
  return user.creditBalance || 0;
}

// CONFIRMED PRICE — option A, decided by Ehaan 27 Oct 2026.
// Credits charged per AI request for a keyless, non-demo user who
// pays with credits instead of their own OpenRouter key (see
// openrouterAccess.js). This is a flat per-request price, NOT
// derived from the metered USD cost in the UsageRecord ledger:
// 1 credit per request means a $5 starter pack (50 credits) buys
// 50 requests. The cost-based alternative (option B) is deferred
// until after launch, once the UsageRecord ledger holds real cost
// data. The env override exists so an operator can tune it without
// a code change; its default is the confirmed 1.
function creditCostPerAiCall() {
  const parsed = parseInt(process.env.CREDITS_PER_AI_CALL, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

// Returns `amount` credits to the user. Used only to refund a
// credit-funded AI request that delivered no result (provider
// failure, or an early error return after the gate spent). The
// increment is unconditional: the caller has already decided the
// spend bought nothing, and refundCreditSpend() in
// openrouterAccess.js clears the spend token before calling this,
// so one request can never refund twice.
async function refundCredits(userId, amount) {
  if (!Number.isFinite(amount) || amount < 1) return null;
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { creditBalance: amount } },
    { new: true },
  ).select("creditBalance");
  return updated ? updated.creditBalance : null;
}

// True when the user holds at least `amount` credits.
async function hasCredits(userId, amount) {
  const balance = await getBalance(userId);
  return balance !== null && balance >= amount;
}

// Atomically spends `amount` credits. Returns the new balance, or
// null when the user does not hold enough — the $gte guard in the
// update means two concurrent spends can never overdraw the balance.
async function spendCredits(userId, amount) {
  const updated = await User.findOneAndUpdate(
    { _id: userId, creditBalance: { $gte: amount } },
    { $inc: { creditBalance: -amount } },
    { new: true },
  ).select("creditBalance");
  return updated ? updated.creditBalance : null;
}

// Credits a captured PayPal order to its user, exactly once.
// Throws when the capture is not COMPLETED or its amount does not
// match the purchase row — a mismatched capture must never credit.
// Returns { alreadyCaptured: true, balance } when this order was
// already credited (e.g. a retried capture request), so callers can
// answer retries without double-crediting. Note the crash window:
// if the process dies between the purchase claim and the balance
// increment, the order reads as captured without the credit; that
// case needs an operator re-credit, and is deliberately not hidden
// by crediting before claiming (which could double-credit instead).
async function applyCapture(userId, purchase, capture) {
  if (!capture || capture.status !== "COMPLETED") {
    const err = new Error("PayPal capture is not COMPLETED");
    err.code = "CAPTURE_NOT_COMPLETED";
    throw err;
  }
  const amountCents = captureAmountCents(capture);
  if (amountCents === null || amountCents !== purchase.amountCents) {
    const err = new Error("PayPal capture amount does not match the purchase");
    err.code = "CAPTURE_AMOUNT_MISMATCH";
    throw err;
  }
  const claimed = await CreditPurchase.findOneAndUpdate(
    { _id: purchase._id, userId, status: "pending" },
    {
      $set: {
        status: "captured",
        paypalCaptureId: captureIdOf(capture),
        capturedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!claimed) {
    const existing = await CreditPurchase.findById(purchase._id).select("status");
    if (existing && existing.status === "captured") {
      return { alreadyCaptured: true, balance: await getBalance(userId) };
    }
    const err = new Error("Credit purchase could not be claimed");
    err.code = "PURCHASE_NOT_CLAIMABLE";
    throw err;
  }
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { creditBalance: purchase.credits } },
    { new: true },
  ).select("creditBalance");
  return { alreadyCaptured: false, balance: updated ? updated.creditBalance : null };
}

module.exports = {
  getBalance,
  hasCredits,
  spendCredits,
  refundCredits,
  applyCapture,
  creditCostPerAiCall,
};
