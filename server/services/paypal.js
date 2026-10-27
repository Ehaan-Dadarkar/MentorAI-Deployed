const axios = require("axios");

// PayPal SANDBOX only. This module never talks to the live PayPal
// API: the base URL defaults to the sandbox host, and an explicit
// override is refused unless it still points at the sandbox host,
// so a mis-set env var cannot silently turn a demo purchase into
// a real charge. Credentials come only from the environment
// (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET); they are never logged
// and never stored in MongoDB.
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

function paypalBase() {
  const base = process.env.PAYPAL_API_BASE || SANDBOX_BASE;
  if (!base.includes("api-m.sandbox.paypal.com")) {
    throw new Error("PayPal is restricted to the sandbox environment");
  }
  return base.replace(/\/$/, "");
}

function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error("PayPal sandbox is not configured");
    err.code = "PAYPAL_NOT_CONFIGURED";
    throw err;
  }
  return { clientId, clientSecret };
}

// Credit packs, priced in integer US cents. A pack id is the only
// thing the client may choose; the amount and credit count always
// come from this table, never from the request body, so a client
// cannot invent a $0.01 order for 1000 credits.
const CREDIT_PACKS = {
  starter: { credits: 50, amountCents: 500, label: "Starter" },
  standard: { credits: 200, amountCents: 1500, label: "Standard" },
  bulk: { credits: 1000, amountCents: 5000, label: "Bulk" },
};

function formatAmount(amountCents) {
  return (amountCents / 100).toFixed(2);
}

async function getAccessToken() {
  const { clientId, clientSecret } = paypalCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await axios.post(
    `${paypalBase()}/v1/oauth2/token`,
    new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    },
  );
  return res.data.access_token;
}

async function createOrder(packId) {
  const pack = CREDIT_PACKS[packId];
  if (!pack) {
    const err = new Error(`Unknown credit pack: ${packId}`);
    err.code = "UNKNOWN_PACK";
    throw err;
  }
  const token = await getAccessToken();
  // Where PayPal sends the buyer after approval (with ?token=<order id>
  // appended) or cancellation, so the client can capture or abandon the
  // order. Without return_url PayPal never comes back to MentorAI and
  // no capture could ever be triggered. Same env override the CORS
  // allowlist uses, falling back to the production frontend origin.
  const appOrigin = (process.env.CLIENT_URL || "https://mentorai-prod.vercel.app").replace(/\/$/, "");
  const res = await axios.post(
    `${paypalBase()}/v2/checkout/orders`,
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: formatAmount(pack.amountCents),
          },
          description: `MentorAI ${pack.label} credit pack (${pack.credits} credits)`,
        },
      ],
      application_context: {
        return_url: `${appOrigin}/credits?paypal=approved`,
        cancel_url: `${appOrigin}/credits?paypal=cancelled`,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );
  const approveLink = (res.data.links || []).find((l) => l.rel === "approve");
  return {
    orderId: res.data.id,
    approveUrl: approveLink ? approveLink.href : null,
    packId,
    credits: pack.credits,
    amountCents: pack.amountCents,
  };
}

// The capture amount PayPal reports for a captured order, in cents.
// Prefers the capture's own amount; falls back to the purchase
// unit amount for captures that carry it there instead.
function captureAmountCents(capture) {
  const unit = (capture.purchase_units || [])[0] || {};
  const captureAmount =
    (unit.payments &&
      unit.payments.captures &&
      unit.payments.captures[0] &&
      unit.payments.captures[0].amount) ||
    unit.amount;
  if (!captureAmount || captureAmount.currency_code !== "USD") return null;
  const value = Number(captureAmount.value);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function captureIdOf(capture) {
  const unit = (capture.purchase_units || [])[0] || {};
  const cap =
    (unit.payments && unit.payments.captures && unit.payments.captures[0]) || {};
  return cap.id || null;
}

async function captureOrder(orderId) {
  const token = await getAccessToken();
  const res = await axios.post(
    `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );
  return res.data;
}

module.exports = {
  SANDBOX_BASE,
  CREDIT_PACKS,
  formatAmount,
  paypalBase,
  getAccessToken,
  createOrder,
  captureOrder,
  captureAmountCents,
  captureIdOf,
};
