// Streaming chunk transcription proxy (slice 55): the client POSTs raw
// 16 kHz mono int16 PCM while the user is still speaking; this route
// forwards each chunk to the Whisper service's /transcribe-chunk endpoint
// and relays the transcript. Same auth + AI limiter as the whole-file
// route, and chunk transcriptions never consume credits. No database is
// connected here: auth's User lookup is stubbed and the Whisper HTTP call
// is stubbed. Fake PCM only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const User = require("../models/User");
const transcribeRouter = require("../routes/transcribe");

const JWT_SECRET = "transcribe-chunk-test-secret-at-least-32-chars";

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

function postChunk(port, token, { body, query } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? Buffer.alloc(3200) : body;
    const req = http.request(
      {
        method: "POST",
        host: "127.0.0.1",
        port,
        path: `/api/voice/transcribe/chunk${query || ""}`,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": payload.length,
          Cookie: `token=${token}`,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function runCase(t, { userDoc, whisperImpl, body, query }) {
  stubAuthUser(t, userDoc);
  stubWhisper(t, whisperImpl);
  const port = await startApp(t);
  const token = jwt.sign({ userId: "user-1" }, JWT_SECRET);
  return postChunk(port, token, { body, query });
}

const keylessUser = { _id: "user-1", email: "user@example.com", isDemo: false };

test("chunk route mounts after auth with the AI limiter and a raw PCM parser", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "transcribe.js"), "utf8");
  assert.match(src, /router\.post\(\s*"\/chunk",\s*auth,\s*dynamicAiLimiter,\s*express\.raw\(/);
});

test("chunk success relays the transcript and echoes seq", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  let seenUrl = "";
  let seenParams = null;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    query: "?seq=3&prompt=hello%20world",
    whisperImpl: async (url, _data, config) => {
      seenUrl = url;
      seenParams = config.params;
      return { data: { success: true, transcript: "hello world", seq: 3 } };
    },
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.transcript, "hello world");
  assert.equal(body.seq, 3);
  assert.match(seenUrl, /\/transcribe-chunk$/);
  assert.equal(seenParams.seq, 3);
  assert.equal(seenParams.prompt, "hello world");
});

test("chunk forwards the raw PCM bytes untouched", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const pcm = Buffer.from([0, 1, 2, 3, 4, 5]);
  let seenData = null;
  let seenContentType = "";
  await runCase(t, {
    userDoc: keylessUser,
    body: pcm,
    whisperImpl: async (_url, data, config) => {
      seenData = data;
      seenContentType = config.headers["Content-Type"];
      return { data: { success: true, transcript: "", seq: 0 } };
    },
  });
  assert.ok(Buffer.isBuffer(seenData));
  assert.deepEqual([...seenData], [0, 1, 2, 3, 4, 5]);
  assert.equal(seenContentType, "application/octet-stream");
});

test("empty chunk body answers 400 without calling Whisper", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  let called = false;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    body: Buffer.alloc(0),
    whisperImpl: async () => {
      called = true;
      return { data: { success: true, transcript: "" } };
    },
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(called, false);
});

test("Whisper chunk success:false answers 502, never success:true", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    whisperImpl: async () => ({ data: { success: false, transcript: "", error: "bad audio" } }),
  });
  assert.equal(status, 502);
  assert.equal(body.success, false);
  assert.equal(body.transcript, "");
});

test("Whisper server down on a chunk answers 502, not 200", async (t) => {
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
