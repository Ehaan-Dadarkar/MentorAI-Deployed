const express = require("express");
const multer = require("multer");
const FormData = require("form-data");
const axios = require("axios");
const auth = require("../middleware/auth");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const WHISPER_URL = process.env.WHISPER_SERVER_URL || "http://127.0.0.1:5001";

router.post("/", auth, upload.single("audio"), async (req, res) => {
  try {
    console.log("Transcribe: received audio");
    console.log("File size:", req.file?.size);
    console.log("Mimetype:", req.file?.mimetype);

    if (!req.file) {
      console.log("Transcribe: no file received");
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

    console.log("Forwarding to Whisper at:", WHISPER_URL);

    const response = await axios.post(`${WHISPER_URL}/transcribe`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const transcript = response.data?.transcript || "";
    console.log("Whisper transcript:", transcript);

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
      return res.json({
        success: false,
        transcript: "",
        error: "Whisper server not running on port 5001",
      });
    }

    return res.json({
      success: false,
      transcript: "",
      error: error.message,
    });
  }
});

module.exports = router;
