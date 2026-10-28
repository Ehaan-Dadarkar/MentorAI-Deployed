// Whisper transcribe failure handling (slice 25): the Node route used to
// ignore Whisper's success:false (HTTP 200) and report success:true
// with an empty transcript, and its own failures also answered HTTP
// 200. It now answers 502 for upstream failures and is rate-limited
// like the other AI routes. No database is connected here: the auth
// middleware's User lookup is stubbed and the Whisper HTTP call is
// stubbed, so these assert the route's own decisions, not MongoDB or
// a real Whisper server. Fake audio only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const cookieParser = require("cookie-parser");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const User = require("../models/User");
const transcribeRouter = require("../routes/transcribe");

const JWT_SECRET = "transcribe-test-secret-at-least-32-chars";

function stubAuthUser(t, userDoc) {
  const original = User.findById;
  User.findById = () => ({
    select: async () => ({ toObject: () => userDoc }),
  });
  t.after(() => {
    User.findById = original;
  });
}

function stubWhisper(t, impl) {
  const original = axios.post;
  axios.post = impl;
  t.after(() => {
    axios.post = original;
  });
}

async function startApp(t) {
  const app = express();
  app.use(cookieParser());
  app.use("/api/voice/transcribe", transcribeRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => server.close());
  return server.address().port;
}

function postAudio(port, token) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("audio", Buffer.from("fake-audio-bytes"), {
      filename: "recording.webm",
      contentType: "audio/webm",
    });
    const req = http.request(
      {
        method: "POST",
        host: "127.0.0.1",
        port,
        path: "/api/voice/transcribe",
        headers: { ...form.getHeaders(), Cookie: `token=${token}` },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      },
    );
    req.on("error", reject);
    form.pipe(req);
  });
}

async function runCase(t, { userDoc, whisperImpl }) {
  stubAuthUser(t, userDoc);
  stubWhisper(t, whisperImpl);
  const port = await startApp(t);
  const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
  return postAudio(port, token);
}

const keylessUser = { _id: "user-1", email: "user@example.com", isDemo: false };

test("transcribe route mounts the AI limiter after auth", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "transcribe.js"), "utf8");
  assert.match(src, /router\.post\("\/", auth, dynamicAiLimiter, upload\.single\("audio"\)/);
});

test("Whisper success:false answers 502, never success:true with an empty transcript", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    whisperImpl: async () => ({ data: { success: false, transcript: "", error: "Audio conversion failed" } }),
  });
  assert.equal(status, 502);
  assert.equal(body.success, false);
  assert.equal(body.transcript, "");
  assert.equal(body.error, "Transcription failed");
});

test("Whisper success:true still returns the transcript with 200", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    whisperImpl: async () => ({ data: { success: true, transcript: "hello world" } }),
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.transcript, "hello world");
});

test("Whisper success:true with an empty transcript stays a 200 empty result (noise, not failure)", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    whisperImpl: async () => ({ data: { success: true, transcript: "" } }),
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.transcript, "");
});

test("Whisper server down answers 502, not 200", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const refused = new Error("connect ECONNREFUSED 127.0.0.1:5001");
  refused.code = "ECONNREFUSED";
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    whisperImpl: async () => {
      throw refused;
    },
  });
  assert.equal(status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error, "Transcription service unavailable");
});
