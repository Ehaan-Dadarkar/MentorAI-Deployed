// Rate-limiter keying (AI/data C1, slice 2).
// Exercises the real limiters through real Express apps with
// `trust proxy` 1 (the Render setup in server.js). Each test uses
// a distinct user id because the limiters' in-memory stores are
// shared for the life of this test file.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const { demoLimiter, loginLimiter } = require("../middleware/rateLimiter");

async function startApp(t, limiter, { status = 200, setUser = false } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  if (setUser) {
    app.use((req, _res, next) => {
      req.userId = req.headers["x-test-user"] || undefined;
      next();
    });
  }
  app.use(limiter);
  app.use((_req, res) => res.status(status).json({ ok: status === 200 }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function hit(base, headers) {
  const res = await fetch(`${base}/`, { headers });
  return res.status;
}

test("demo limiter: one authed user cannot rotate buckets with forged X-Forwarded-For", async (t) => {
  const base = await startApp(t, demoLimiter, { setUser: true });
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    statuses.push(
      await hit(base, {
        "x-test-user": "demo-user-a",
        "x-forwarded-for": `forged-${i}, 203.0.113.7`,
      }),
    );
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
});

test("demo limiter: a second user from the same IP gets a fresh bucket", async (t) => {
  const base = await startApp(t, demoLimiter, { setUser: true });
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push(await hit(base, { "x-test-user": "demo-user-b", "x-forwarded-for": "1.2.3.4" }));
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

test("login limiter: failed attempts through a forwarding proxy share one bucket despite a rotating forged entry", async (t) => {
  const base = await startApp(t, loginLimiter, { status: 401 });
  const statuses = [];
  for (let i = 0; i < 31; i++) {
    statuses.push(await hit(base, { "x-forwarded-for": `forged-${i}, 203.0.113.9` }));
  }
  assert.deepEqual(statuses.slice(0, 30), Array(30).fill(401));
  assert.equal(statuses[30], 429);
});
