// Login limiter is mounted exactly once (slice 14).
// server.js used to mount loginLimiter on /api/auth/login and
// /api/auth/register AND the auth router applied it again on the
// same routes, so one failed attempt consumed two of the 30 hourly
// slots (15 real failures exhausted the budget). The router is now
// the single mount point; this test pins that, plus the behaviour
// of a single mount: 30 failed attempts, then 429 on the 31st.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const http = require("node:http");

const { loginLimiter } = require("../middleware/rateLimiter");

const serverSrc = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8",
);
const authSrc = fs.readFileSync(
  path.join(__dirname, "..", "routes", "auth.js"),
  "utf8",
);

test("server.js never mounts loginLimiter via app.use", () => {
  const mounts = serverSrc
    .split("\n")
    .filter((line) => line.includes("app.use") && line.includes("loginLimiter"));
  assert.deepEqual(mounts, []);
});

test("auth router applies loginLimiter to login, register and demo-login", () => {
  for (const route of ["/login", "/register", "/demo-login"]) {
    assert.match(
      authSrc,
      new RegExp(`router\\.post\\(\\s*"${route}",\\s*loginLimiter`),
      `${route} must carry loginLimiter exactly once, in the router`,
    );
  }
});

test("a single loginLimiter mount allows 30 failed attempts, then 429s", async (t) => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(loginLimiter);
  app.use((_req, res) => res.status(401).json({ ok: false }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const statuses = [];
  for (let i = 0; i < 31; i++) {
    const res = await fetch(base, {
      headers: { "x-forwarded-for": "203.0.113.99" },
    });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 30), Array(30).fill(401));
  assert.equal(statuses[30], 429);
});
