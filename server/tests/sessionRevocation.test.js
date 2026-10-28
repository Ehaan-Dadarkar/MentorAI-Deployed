// Session revocation via tokenVersion + HS256 pin + boot secret check
// (Backend M8, minor m20, slice 43). Before this slice, tokens lasted
// 7 days with no revocation: logout only cleared the cookie, there was
// no password-change endpoint, and jwt.sign/jwt.verify pinned no
// algorithm. Now every token carries the user's tokenVersion, the auth
// middleware and /me reject tokens whose version no longer matches,
// logout-everywhere and password change bump the version, and the
// secret must be at least 32 characters or the service refuses to
// boot. No database is connected here: User methods are stubbed per
// test, so these assert the routes' and middleware's own decisions.
// Fake ids and secrets only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const authRouter = require("../routes/auth");
const {
  signToken,
  verifyToken,
  getJwtSecret,
} = require("../services/jwt");

const JWT_SECRET = "session-revocation-test-secret-32c";

const origJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = JWT_SECRET;
test.after(() => {
  if (origJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = origJwtSecret;
});

async function startProbeApp(t, { userVersion, userExists = true }) {
  const origFindById = User.findById;
  User.findById = () => ({
    select: async () =>
      userExists
        ? {
            tokenVersion: userVersion,
            toObject: () => ({ _id: "user-1", tokenVersion: userVersion }),
          }
        : null,
  });
  t.after(() => {
    User.findById = origFindById;
  });

  const app = express();
  app.use(cookieParser());
  app.use(authMiddleware);
  app.use((_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (token) => {
    const res = await fetch(base, {
      headers: { cookie: `token=${token}` },
    });
    return res.status;
  };
}

async function startAuthApp(t, { isDemo = false } = {}) {
  const currentHash = await bcrypt.hash("old-password-123", 4);
  const updates = [];
  const origFindById = User.findById;
  const origFindByIdAndUpdate = User.findByIdAndUpdate;
  const userDoc = {
    _id: "user-1",
    name: "Test",
    isDemo,
    tokenVersion: 2,
    passwordHash: currentHash,
    toObject: () => ({ _id: "user-1", name: "Test", isDemo, tokenVersion: 2 }),
  };
  User.findById = () => ({ select: async () => userDoc });
  User.findByIdAndUpdate = async (_id, update) => {
    updates.push(update);
    return {};
  };
  t.after(() => {
    User.findById = origFindById;
    User.findByIdAndUpdate = origFindByIdAndUpdate;
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || "error" });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signToken("user-1", 2);
  const post = async (path, body) => {
    const res = await fetch(`${base}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `token=${token}`,
      },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({})),
      setCookie: res.headers.get("set-cookie") || "",
    };
  };
  return { post, updates };
}

test("signToken mints HS256 tokens carrying tokenVersion", () => {
  const token = signToken("user-1", 3);
  const decoded = jwt.decode(token, { complete: true });
  assert.equal(decoded.header.alg, "HS256");
  assert.equal(decoded.payload.userId, "user-1");
  assert.equal(decoded.payload.tokenVersion, 3);
});

test("verifyToken accepts a signToken token", () => {
  const decoded = verifyToken(signToken("user-1", 1));
  assert.equal(decoded.userId, "user-1");
  assert.equal(decoded.tokenVersion, 1);
});

test("verifyToken rejects a token signed with another algorithm", () => {
  const forged = jwt.sign({ userId: "user-1", tokenVersion: 0 }, JWT_SECRET, {
    algorithm: "HS384",
  });
  assert.throws(() => verifyToken(forged));
});

test("getJwtSecret throws when the secret is missing", () => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  } finally {
    process.env.JWT_SECRET = saved;
  }
});

test("getJwtSecret throws when the secret is short, accepts 32 chars", () => {
  const saved = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "too-short-secret";
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = "a".repeat(32);
    assert.equal(getJwtSecret(), "a".repeat(32));
  } finally {
    process.env.JWT_SECRET = saved;
  }
});

test("middleware passes a token whose version matches the user", async (t) => {
  const probe = await startProbeApp(t, { userVersion: 2 });
  assert.equal(await probe(signToken("user-1", 2)), 200);
});

test("middleware rejects a stale-version token (the stolen-token case)", async (t) => {
  const probe = await startProbeApp(t, { userVersion: 2 });
  assert.equal(await probe(signToken("user-1", 1)), 401);
});

test("middleware passes a legacy token without a version for a never-bumped user", async (t) => {
  const probe = await startProbeApp(t, { userVersion: 0 });
  const legacy = jwt.sign({ userId: "user-1" }, JWT_SECRET);
  assert.equal(await probe(legacy), 200);
});

test("middleware rejects a legacy token once the user has bumped", async (t) => {
  const probe = await startProbeApp(t, { userVersion: 1 });
  const legacy = jwt.sign({ userId: "user-1" }, JWT_SECRET);
  assert.equal(await probe(legacy), 401);
});

test("middleware still rejects an unknown user", async (t) => {
  const probe = await startProbeApp(t, { userVersion: 0, userExists: false });
  assert.equal(await probe(signToken("user-1", 0)), 401);
});

test("logout-everywhere bumps tokenVersion and clears the cookie", async (t) => {
  const { post, updates } = await startAuthApp(t);
  const res = await post("/logout-everywhere", {});
  assert.equal(res.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].$inc.tokenVersion, 1);
  assert.match(res.setCookie, /token=;/);
});

test("change-password with a wrong current password is 401 with no update", async (t) => {
  const { post, updates } = await startAuthApp(t);
  const res = await post("/change-password", {
    currentPassword: "not-the-password",
    newPassword: "new-password-123",
  });
  assert.equal(res.status, 401);
  assert.equal(updates.length, 0);
});

test("change-password with the right current password updates the hash, bumps, and clears the cookie", async (t) => {
  const { post, updates } = await startAuthApp(t);
  const res = await post("/change-password", {
    currentPassword: "old-password-123",
    newPassword: "new-password-123",
  });
  assert.equal(res.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].$inc.tokenVersion, 1);
  assert.equal(
    await bcrypt.compare("new-password-123", updates[0].$set.passwordHash),
    true,
  );
  assert.match(res.setCookie, /token=;/);
});

test("change-password is blocked for demo users", async (t) => {
  const { post, updates } = await startAuthApp(t, { isDemo: true });
  const res = await post("/change-password", {
    currentPassword: "old-password-123",
    newPassword: "new-password-123",
  });
  assert.equal(res.status, 403);
  assert.equal(updates.length, 0);
});

test("change-password rejects a too-short new password with 400", async (t) => {
  const { post, updates } = await startAuthApp(t);
  const res = await post("/change-password", {
    currentPassword: "old-password-123",
    newPassword: "short",
  });
  assert.equal(res.status, 400);
  assert.equal(updates.length, 0);
});
