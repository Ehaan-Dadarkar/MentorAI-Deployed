// CSRF origin check (Backend M2, slice 41): the audit's "at minimum"
// fix. A cross-site POST carries the victim's cookies regardless of
// CORS, and the auth cookie is sameSite: "none" in production, so
// this middleware checks Origin (else Referer) against the exact
// CORS allowlist on every state-changing request. No database is
// connected here: the middleware is exercised through a small
// express app with a dummy route, plus a source check that
// server.js mounts it once, before the routes. No secrets are
// involved; origins below are the public frontend hosts and an
// obviously fake attacker host.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const axios = require("axios");

const { csrfOriginCheck } = require("../middleware/csrfOrigin");

const REAL_ORIGIN = "https://mentorai-prod.vercel.app";
const EVIL_ORIGIN = "https://evil.vercel.app";

async function startApp(t) {
  const app = express();
  app.use(csrfOriginCheck);
  app.all("/ping", (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(base, method, headers) {
  const res = await axios({
    method,
    url: `${base}/ping`,
    headers,
    validateStatus: () => true,
  });
  return res.status;
}

test("POST with an allowlisted Origin passes", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "post", { Origin: REAL_ORIGIN }), 200);
});

test("POST with a foreign Origin is rejected 403", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "post", { Origin: EVIL_ORIGIN }), 403);
});

test("POST with a serialized Origin of null is rejected 403", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "post", { Origin: "null" }), 403);
});

test("POST with no Origin but an allowlisted Referer passes", async (t) => {
  const base = await startApp(t);
  assert.equal(
    await request(base, "post", { Referer: `${REAL_ORIGIN}/tutor` }),
    200,
  );
});

test("POST with no Origin but a foreign Referer is rejected 403", async (t) => {
  const base = await startApp(t);
  assert.equal(
    await request(base, "post", { Referer: `${EVIL_ORIGIN}/x` }),
    403,
  );
});

test("POST with no Origin and an unparseable Referer is rejected 403", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "post", { Referer: "::::" }), 403);
});

test("POST with neither header passes (non-browser client passthrough)", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "post", {}), 200);
});

test("GET is not state-changing, so a foreign Origin passes", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "get", { Origin: EVIL_ORIGIN }), 200);
});

test("PUT and DELETE with a foreign Origin are rejected 403", async (t) => {
  const base = await startApp(t);
  assert.equal(await request(base, "put", { Origin: EVIL_ORIGIN }), 403);
  assert.equal(await request(base, "delete", { Origin: EVIL_ORIGIN }), 403);
});

test("server.js mounts csrfOriginCheck exactly once, before the routes", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const mounts = (src.match(/app\.use\(csrfOriginCheck\)/g) || []).length;
  assert.equal(mounts, 1);
  assert.ok(
    src.indexOf("app.use(csrfOriginCheck)") <
      src.indexOf("app.use('/api/auth'"),
  );
});
