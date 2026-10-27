const express = require("express");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const CreditPurchase = require("../models/CreditPurchase");
const paypal = require("../services/paypal");
const credits = require("../services/credits");

const router = express.Router();

// Credit packs are public information (prices, not secrets).
router.get("/packs", (_req, res) => {
  const packs = Object.entries(paypal.CREDIT_PACKS).map(([id, pack]) => ({
    id,
    credits: pack.credits,
    amountCents: pack.amountCents,
    amount: paypal.formatAmount(pack.amountCents),
    currency: "USD",
    label: pack.label,
  }));
  res.json({ success: true, packs });
});

router.get("/balance", auth, async (req, res) => {
  try {
    const balance = await credits.getBalance(req.user._id);
    if (balance === null) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    res.json({ success: true, credits: balance });
  } catch (err) {
    console.error("Error in /api/credits/balance GET", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

const createOrderSchema = z.object({
  packId: z.enum(Object.keys(paypal.CREDIT_PACKS)),
});

router.post("/create-order", auth, validate(createOrderSchema), async (req, res) => {
  try {
    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        error: "Demo account cannot buy credits.",
      });
    }
    const order = await paypal.createOrder(req.body.packId);
    await CreditPurchase.create({
      userId: req.user._id,
      paypalOrderId: order.orderId,
      packId: order.packId,
      credits: order.credits,
      amountCents: order.amountCents,
      currency: "USD",
      status: "pending",
    });
    res.json({
      success: true,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
      packId: order.packId,
      credits: order.credits,
      amount: paypal.formatAmount(order.amountCents),
      currency: "USD",
    });
  } catch (err) {
    if (err.code === "PAYPAL_NOT_CONFIGURED") {
      return res.status(503).json({ success: false, error: "PayPal sandbox is not configured" });
    }
    if (err.message && err.message.includes("sandbox")) {
      return res.status(503).json({ success: false, error: err.message });
    }
    console.error("Error in /api/credits/create-order POST", err.message || err);
    res.status(502).json({ success: false, error: "PayPal sandbox request failed" });
  }
});

const captureOrderSchema = z.object({
  orderId: z.string().min(1).max(200),
});

router.post("/capture-order", auth, validate(captureOrderSchema), async (req, res) => {
  try {
    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        error: "Demo account cannot buy credits.",
      });
    }
    const purchase = await CreditPurchase.findOne({
      paypalOrderId: req.body.orderId,
      userId: req.user._id,
    });
    if (!purchase) {
      return res.status(404).json({ success: false, error: "Credit purchase not found" });
    }
    // Idempotent retry: an already-captured order answers with the
    // current balance and never calls PayPal or credits twice.
    if (purchase.status === "captured") {
      const balance = await credits.getBalance(req.user._id);
      return res.json({ success: true, credits: balance, alreadyCaptured: true });
    }
    const capture = await paypal.captureOrder(req.body.orderId);
    const result = await credits.applyCapture(req.user._id, purchase, capture);
    res.json({ success: true, credits: result.balance, alreadyCaptured: result.alreadyCaptured });
  } catch (err) {
    if (err.code === "PAYPAL_NOT_CONFIGURED") {
      return res.status(503).json({ success: false, error: "PayPal sandbox is not configured" });
    }
    if (err.code === "CAPTURE_NOT_COMPLETED" || err.code === "CAPTURE_AMOUNT_MISMATCH") {
      return res.status(422).json({ success: false, error: err.message });
    }
    console.error("Error in /api/credits/capture-order POST", err.message || err);
    res.status(502).json({ success: false, error: "PayPal sandbox request failed" });
  }
});

module.exports = router;
