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
  applyCapture,
};
