const express = require("express");
const multer = require("multer");
const FormData = require("form-data");
const axios = require("axios");
const auth = require("../middleware/auth");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const WHISPER_URL = process.env.WHISPER_SERVER_URL || "http://127.0.0.1:5001";

router.post("/", auth, dynamicAiLimiter, upload.single("audio"), async (req, res) => {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("Transcribe: received audio");
      console.log("File size:", req.file?.size);
      console.log("Mimetype:", req.file?.mimetype);
    }

    if (!req.file) {
      if (process.env.NODE_ENV !== "production") {
        console.log("Transcribe: no file received");
      }
      return res.status(400).json({
        success: false,
        transcript: "",
        error: "No audio file provided",
      });
    }

    const formData = new FormData();
    formData.append("audio", req.file.buffer, {
      filename: "recording.webm",
      contentType: req.file.mimetype || "audio/webm",
      knownLength: req.file.buffer.length,
    });

    const subject = req.body.subject || "";
    if (subject) formData.append("subject", subject);

    if (process.env.NODE_ENV !== "production") {
      console.log("Forwarding to Whisper at:", WHISPER_URL);
    }

    const response = await axios.post(`${WHISPER_URL}/transcribe`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // Whisper returns HTTP 200 with success:false on failure, so the
    // flag — not the status — is the failure signal. Never report a
    // failed transcription as success with an empty transcript.
    if (response.data?.success === false) {
      console.error("Whisper reported failure:", response.data?.error);
      return res.status(502).json({
        success: false,
        transcript: "",
        error: "Transcription failed",
      });
    }

    const transcript = response.data?.transcript || "";
    if (process.env.NODE_ENV !== "production") {
      console.log("Whisper transcript:", transcript);
    }

    return res.json({
      success: true,
      transcript,
    });
  } catch (error) {
    console.error("Transcribe error message:", error.message);
    console.error("Transcribe error code:", error.code);
    console.error(
      "Axios response:",
      error.response?.status,
      error.response?.data,
    );

    if (error.code === "ECONNREFUSED") {
      console.error("Whisper server is not running!");
      return res.status(502).json({
        success: false,
        transcript: "",
        error: "Transcription service unavailable",
      });
    }

    return res.status(502).json({
      success: false,
      transcript: "",
      error: "Transcription failed",
    });
  }
});

// Streaming chunk proxy (slice 55): the client POSTs raw 16 kHz mono int16
// PCM while the user is still speaking; each chunk is transcribed immediately
// so the transcript builds live. Same auth + AI limiter as the whole-file
// route. Chunk transcriptions do not consume credits.
router.post(
  "/chunk",
  auth,
  dynamicAiLimiter,
  express.raw({ type: "application/octet-stream", limit: "512kb" }),
  async (req, res) => {
    try {
      const seq = Math.max(0, parseInt(req.query.seq, 10) || 0);
      const prompt = String(req.query.prompt || "").slice(0, 300);
      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ success: false, transcript: "", error: "empty chunk" });
      }
      const response = await axios.post(`${WHISPER_URL}/transcribe-chunk`, req.body, {
        params: { seq, prompt },
        headers: { "Content-Type": "application/octet-stream" },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      if (response.data?.success === false) {
        console.error("Whisper chunk reported failure:", response.data?.error);
        return res.status(502).json({ success: false, transcript: "", error: "Transcription failed" });
      }
      return res.json({
        success: true,
        transcript: response.data?.transcript || "",
        seq: response.data?.seq ?? seq,
      });
    } catch (error) {
      console.error("Chunk transcribe error:", error.message, error.code);
      if (error.code === "ECONNREFUSED") {
        return res.status(502).json({ success: false, transcript: "", error: "Transcription service unavailable" });
      }
      return res.status(502).json({ success: false, transcript: "", error: "Transcription failed" });
    }
  },
);

module.exports = router;

