const mongoose = require("mongoose");

// One row per PayPal sandbox credit purchase. This is the record that
// makes crediting idempotent: a PayPal order id can only ever credit
// its user once, because capture flips status pending -> captured
// with an atomic findOneAndUpdate, and a second capture of the same
// order returns the existing balance instead of crediting again.
// No PayPal secret, token, or payer financial data is stored here.
const creditPurchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    paypalOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paypalCaptureId: {
      type: String,
      default: null,
    },
    packId: {
      type: String,
      required: true,
    },
    credits: {
      type: Number,
      required: true,
      min: 1,
    },
    // Integer minor units (US cents), never a float, so amount
    // comparison against PayPal's capture value is exact.
    amountCents: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["pending", "captured", "failed"],
      default: "pending",
      index: true,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

creditPurchaseSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("CreditPurchase", creditPurchaseSchema);
