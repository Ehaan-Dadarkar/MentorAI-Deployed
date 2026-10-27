// PayPal sandbox credits slice (item 9, slice 10).
// The PayPal HTTP calls are stubbed (fake credentials only, in
// memory); no network, no live PayPal account, and no database are
// involved. Model methods are stubbed per test, so crediting
// idempotency is asserted against the real credits service logic.
process.env.PAYPAL_CLIENT_ID = "fake-client-id";
process.env.PAYPAL_CLIENT_SECRET = "fake-client-secret";
delete process.env.PAYPAL_API_BASE;

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

// Same bare specifier paypal.js uses, so this is the same axios object.
const axios = require("axios");
const paypal = require("../services/paypal");
const credits = require("../services/credits");
const User = require("../models/User");
const CreditPurchase = require("../models/CreditPurchase");

function stubPost(t, impl) {
  const original = axios.post;
  axios.post = impl;
  t.after(() => {
    axios.post = original;
  });
}

function stubMethod(t, obj, name, impl) {
  const original = obj[name];
  obj[name] = impl;
  t.after(() => {
    obj[name] = original;
  });
}

function tokenAndOrderCalls() {
  const calls = [];
  return {
    calls,
    impl: async (url, data) => {
      calls.push(url);
      if (url.includes("/v1/oauth2/token")) {
        return { data: { access_token: "fake-token" } };
      }
      if (url.endsWith("/v2/checkout/orders")) {
        assert.equal(data.intent, "CAPTURE");
        return {
          data: {
            id: "ORDER-1",
            links: [{ rel: "approve", href: "https://sandbox.paypal/approve" }],
          },
        };
      }
      throw new Error(`unexpected URL ${url}`);
    },
  };
}

function completedCapture(value) {
  return {
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [{ id: "CAP-1", amount: { currency_code: "USD", value } }],
        },
      },
    ],
  };
}

const purchase = {
  _id: "purchase-1",
  userId: "user-1",
  packId: "starter",
  credits: 50,
  amountCents: 500,
};

test("createOrder uses the sandbox host, intent CAPTURE, and the server pack price", async (t) => {
  const stub = tokenAndOrderCalls();
  stubPost(t, async (url, data) => {
    if (url.includes("/v2/checkout/orders")) {
      assert.equal(data.purchase_units[0].amount.value, "5.00");
      assert.equal(data.purchase_units[0].amount.currency_code, "USD");
    }
    return stub.impl(url, data);
  });
  const order = await paypal.createOrder("starter");
  assert.equal(order.orderId, "ORDER-1");
  assert.equal(order.approveUrl, "https://sandbox.paypal/approve");
  assert.equal(order.credits, 50);
  assert.equal(order.amountCents, 500);
  assert.ok(stub.calls[0].startsWith("https://api-m.sandbox.paypal.com"));
  assert.ok(stub.calls.every((u) => u.includes("sandbox")));
});

test("createOrder sends PayPal return/cancel URLs so approval comes back to /credits", async (t) => {
  const stub = tokenAndOrderCalls();
  let orderBody = null;
  stubPost(t, async (url, data) => {
    if (url.endsWith("/v2/checkout/orders")) orderBody = data;
    return stub.impl(url, data);
  });
  delete process.env.CLIENT_URL;
  await paypal.createOrder("starter");
  assert.equal(
    orderBody.application_context.return_url,
    "https://mentorai-prod.vercel.app/credits?paypal=approved",
  );
  assert.equal(
    orderBody.application_context.cancel_url,
    "https://mentorai-prod.vercel.app/credits?paypal=cancelled",
  );

  process.env.CLIENT_URL = "https://example.example";
  await paypal.createOrder("starter");
  assert.equal(
    orderBody.application_context.return_url,
    "https://example.example/credits?paypal=approved",
  );
  delete process.env.CLIENT_URL;
});

test("createOrder rejects an unknown pack without any HTTP call", async (t) => {
  let calls = 0;
  stubPost(t, async () => {
    calls += 1;
    throw new Error("must not be called");
  });
  await assert.rejects(paypal.createOrder("nope"), /Unknown credit pack/);
  assert.equal(calls, 0);
});

test("paypalBase refuses a non-sandbox override, and missing credentials give 503-style code", async (t) => {
  process.env.PAYPAL_API_BASE = "https://api-m.paypal.com";
  assert.throws(() => paypal.paypalBase(), /sandbox/);
  delete process.env.PAYPAL_API_BASE;

  const savedId = process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_ID;
  await assert.rejects(paypal.getAccessToken(), (e) => e.code === "PAYPAL_NOT_CONFIGURED");
  process.env.PAYPAL_CLIENT_ID = savedId;
});

test("captureAmountCents parses the capture amount and rejects a currency mismatch", () => {
  assert.equal(paypal.captureAmountCents(completedCapture("5.00")), 500);
  assert.equal(paypal.captureAmountCents(completedCapture("15.00")), 1500);
  const eur = completedCapture("5.00");
  eur.purchase_units[0].payments.captures[0].amount.currency_code = "EUR";
  assert.equal(paypal.captureAmountCents(eur), null);
  assert.equal(paypal.captureIdOf(completedCapture("5.00")), "CAP-1");
});

test("applyCapture credits once, and a retried capture does not credit again", async (t) => {
  let incCalls = 0;
  let incAmount = 0;
  stubMethod(t, CreditPurchase, "findOneAndUpdate", async () => purchase);
  stubMethod(t, User, "findByIdAndUpdate", (_id, update) => {
    incCalls += 1;
    incAmount = update.$inc.creditBalance;
    return { select: async () => ({ creditBalance: 50 }) };
  });
  const first = await credits.applyCapture("user-1", purchase, completedCapture("5.00"));
  assert.equal(first.alreadyCaptured, false);
  assert.equal(first.balance, 50);
  assert.equal(incCalls, 1);
  assert.equal(incAmount, 50);

  // Second capture of the same order: the claim now loses, the
  // purchase reads as captured, and no second increment happens.
  stubMethod(t, CreditPurchase, "findOneAndUpdate", async () => null);
  stubMethod(t, CreditPurchase, "findById", () => ({
    select: async () => ({ status: "captured" }),
  }));
  stubMethod(t, User, "findById", () => ({
    select: async () => ({ creditBalance: 50 }),
  }));
  const second = await credits.applyCapture("user-1", purchase, completedCapture("5.00"));
  assert.equal(second.alreadyCaptured, true);
  assert.equal(second.balance, 50);
  assert.equal(incCalls, 1);
});

test("applyCapture refuses a non-COMPLETED capture and an amount mismatch before claiming", async (t) => {
  let claims = 0;
  stubMethod(t, CreditPurchase, "findOneAndUpdate", async () => {
    claims += 1;
    return purchase;
  });
  await assert.rejects(
    credits.applyCapture("user-1", purchase, { status: "PENDING", purchase_units: [] }),
    /not COMPLETED/,
  );
  await assert.rejects(
    credits.applyCapture("user-1", purchase, completedCapture("15.00")),
    /does not match/,
  );
  assert.equal(claims, 0);
});

test("spendCredits spends atomically and returns null when the balance is short", async (t) => {
  stubMethod(t, User, "findOneAndUpdate", async (filter) => {
    if (filter.creditBalance.$gte === 10) return { creditBalance: 40 };
    return null;
  });
  // The service selects creditBalance off the query; emulate that shape.
  const real = User.findOneAndUpdate;
  User.findOneAndUpdate = (filter, update) => ({
    select: async () => real(filter, update),
  });
  t.after(() => {
    User.findOneAndUpdate = real;
  });
  assert.equal(await credits.spendCredits("user-1", 10), 40);
  assert.equal(await credits.spendCredits("user-1", 999), null);
});

test("GET /api/credits/packs lists the server-side packs with no auth", async (t) => {
  const router = require("../routes/credits");
  const app = express();
  app.use("/api/credits", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/credits/packs`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  const starter = body.packs.find((p) => p.id === "starter");
  assert.equal(starter.credits, 50);
  assert.equal(starter.amount, "5.00");
  assert.equal(body.packs.length, 3);
});
