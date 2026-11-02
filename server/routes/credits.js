const express = require("express");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const CreditPurchase = require("../models/CreditPurchase");
const axios = require("axios");
const paypal = require("../services/paypal");
const credits = require("../services/credits");

// H2: PayPal answers a second capture call on an already-captured
// order with 422 / ORDER_ALREADY_CAPTURED. That is exactly the
// "money moved, response lost" window: our row stayed pending while
// PayPal holds the money. Retrying the capture call can never
// succeed then, so detect it and recover by reading the order and
// applying its completed capture through the same exactly-once
// applyCapture claim (atomic pending -> captured, then $inc).
function isOrderAlreadyCapturedError(err) {
  const details = err && err.response && err.response.data && err.response.data.details;
  return (
    err &&
    err.response &&
    err.response.status === 422 &&
    Array.isArray(details) &&
    details.some((d) => d && d.issue === "ORDER_ALREADY_CAPTURED")
  );
}

// Fetches the PayPal order and returns it when it carries a
// COMPLETED capture. The order object already has the shape
// applyCapture expects (status + purchase_units[].payments.captures),
// so it is passed through unchanged.
async function fetchCompletedOrderCapture(orderId) {
  const token = await paypal.getAccessToken();
  const res = await axios.get(
    `${paypal.paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 30000,
    },
  );
  const order = res.data;
  if (!order || order.status !== "COMPLETED") return null;
  const captures = (order.purchase_units || []).flatMap(
    (unit) => (unit.payments && unit.payments.captures) || [],
  );
  const completed = captures.find((c) => c && c.status === "COMPLETED");
  if (!completed) return null;
  return order;
}

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

// H2: purchase history backing the Credits page's pending-purchase
// list. A capture that fails (PayPal 500, lost response, dropped tab)
// leaves the row pending; the client lists those rows and offers a
// retry, instead of the payment being stranded with no self-service
// path.
router.get("/purchases", auth, async (req, res) => {
  try {
    const purchases = await CreditPurchase.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("paypalOrderId packId credits amountCents currency status createdAt")
      .lean();
    res.json({
      success: true,
      purchases: purchases.map((p) => ({
        id: String(p._id),
        paypalOrderId: p.paypalOrderId,
        packId: p.packId,
        credits: p.credits,
        amountCents: p.amountCents,
        amount: paypal.formatAmount(p.amountCents),
        currency: p.currency || "USD",
        status: p.status,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error("Error in /api/credits/purchases GET", err.message || err);
    res.status(500).json({ success: false, error: "Server error" });
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
    let capture;
    try {
      capture = await paypal.captureOrder(req.body.orderId);
    } catch (captureErr) {
      // Lost-response window: the money moved but our capture call
      // never answered, so the row stayed pending and PayPal now
      // refuses a second capture. Recover from the order itself.
      if (isOrderAlreadyCapturedError(captureErr)) {
        const recovered = await fetchCompletedOrderCapture(req.body.orderId);
        if (recovered) {
          const result = await credits.applyCapture(req.user._id, purchase, recovered);
          return res.json({
            success: true,
            credits: result.balance,
            alreadyCaptured: result.alreadyCaptured,
            recovered: true,
          });
        }
      }
      throw captureErr;
    }
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
