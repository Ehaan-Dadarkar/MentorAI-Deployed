// CORS exact-origin allowlist (AI/data M3, slice 4).
// Exercises the real cors middleware from middleware/cors.js
// through a real Express app — not a copy of its logic.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const { allowedOrigins, isAllowedOrigin, corsMiddleware } = require("../middleware/cors");

async function withServer(t, handler) {
  const app = express();
  app.use(corsMiddleware);
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("allowlist holds only exact origins — no regex entry", () => {
  for (const origin of allowedOrigins) assert.equal(typeof origin, "string");
  assert.ok(allowedOrigins.includes("https://mentorai-prod.vercel.app"));
  assert.ok(allowedOrigins.includes("https://mentorai.vercel.app"));
  assert.ok(!allowedOrigins.some((o) => o.includes("vercel.app$")));
});

test("isAllowedOrigin is an exact match, not a suffix match", () => {
  assert.equal(isAllowedOrigin("https://mentorai-prod.vercel.app"), true);
  assert.equal(isAllowedOrigin("https://evil.vercel.app"), false);
  assert.equal(isAllowedOrigin("https://mentorai-prod.vercel.app.evil.com"), false);
  assert.equal(isAllowedOrigin("http://localhost:5173.evil.com"), false);
  assert.equal(isAllowedOrigin(undefined), true); // non-browser clients
});

test("real middleware allows the production origin and denies an attacker Vercel origin", async (t) => {
  const base = await withServer(t);
  const allowed = await fetch(`${base}/ping`, { headers: { Origin: "https://mentorai-prod.vercel.app" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://mentorai-prod.vercel.app");

  const denied = await fetch(`${base}/ping`, { headers: { Origin: "https://evil.vercel.app" } });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});
