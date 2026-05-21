const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");
const {
  generateVoiceRecallQuestions,
  evaluateVoiceAnswer,
} = require("../services/ai");
const VoiceSession = require("../models/VoiceSession");
const Note = require("../models/Note");
const User = require("../models/User");
const StudySession = require("../models/StudySession");

const router = express.Router();

function toObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

// ─────────────────────────────────────────────────────────
// POST /api/voice-recall/generate-questions
// Input: { noteId, count }
// Output: question array
// ─────────────────────────────────────────────────────────

const generateQuestionsSchema = z.object({
  noteId: z.string(),
  count: z.number().min(1).max(10).optional().default(3),
});

router.post(
  "/generate-questions",
  auth,
  dynamicAiLimiter,
  validate(generateQuestionsSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const { noteId, count } = req.body;

      // Fetch note from DB
      const note = await Note.findOne({ _id: noteId, userId: req.userId });
      if (!note) {
        return res.status(404).json({
          success: false,
          message: "Note not found",
        });
      }

      if (!note.content || note.content.length < 10) {
        return res.status(400).json({
          success: false,
          message: "Note content too short for question generation",
        });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log("Note content length:", note.content?.length);
      }

      // Strip HTML tags to get plain text
      const stripHtml = (html) => {
        return html
          .replace(/<[^>]*>/g, " ") // remove all HTML tags
          .replace(/&nbsp;/g, " ") // replace &nbsp;
          .replace(/&amp;/g, "&") // replace &amp;
          .replace(/&lt;/g, "<") // replace &lt;
          .replace(/&gt;/g, ">") // replace &gt;
          .replace(/&quot;/g, '"') // replace &quot;
          .replace(/\s+/g, " ") // collapse whitespace
          .trim();
      };

      const plainContent = stripHtml(note.content);

      // Truncate to 800 chars to leave room for AI response
      const truncatedContent = plainContent.substring(0, 800);

      if (process.env.NODE_ENV !== "production") {
        console.log("Plain content preview:", truncatedContent.substring(0, 300));
      }

      if (truncatedContent.length < 10) {
        return res.status(400).json({
          success: false,
          message: "Note content too short after processing",
        });
      }

      // Generate questions via OpenRouter
      const questions = await generateVoiceRecallQuestions(
        note.title,
        truncatedContent,
        count,
        "meta-llama/llama-3.1-8b-instruct",
        { apiKey: access.apiKey },
      );

      res.json({
        success: true,
        questions,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /api/voice-recall/evaluate
// Input: { question, correctKeyPoints, spokenAnswer, confidence }
// Output: evaluation object
// ─────────────────────────────────────────────────────────

const evaluateSchema = z.object({
  question: z.string().min(1),
  correctKeyPoints: z.array(z.string()),
  spokenAnswer: z.string(),
  confidence: z.number().min(1).max(5),
});

router.post(
  "/evaluate",
  auth,
  dynamicAiLimiter,
  validate(evaluateSchema),
  async (req, res, next) => {
    try {
      const { question, correctKeyPoints, spokenAnswer, confidence } = req.body;

      // If answer is empty or whitespace, skip evaluation
      if (!spokenAnswer || spokenAnswer.trim() === "") {
        return res.json({
          success: true,
          evaluation: {
            score: 0,
            verdict: "skipped",
            whatWasCorrect: "",
            whatWasMissed: correctKeyPoints,
            improvement: "Review this concept and try again",
            encouragement: "",
          },
        });
      }

      // Evaluate via OpenRouter
      const evaluation = await evaluateVoiceAnswer(
        question,
        correctKeyPoints,
        spokenAnswer,
        confidence,
      );

      res.json({
        success: true,
        evaluation,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /api/voice-recall/save-session
// Input: { noteId, questions[], responses[], avgScore, weakConcepts[] }
// Output: saved session
// ─────────────────────────────────────────────────────────

const saveSessionSchema = z.object({
  noteId: z.string().optional(),
  questions: z.array(z.string()),
  responses: z.array(
    z.object({
      question: z.string(),
      spokenAnswer: z.string(),
      score: z.number().min(0).max(100),
      verdict: z.string(),
    }),
  ),
  avgScore: z.number().min(0).max(100),
  weakConcepts: z.array(z.string()).optional().default([]),
});

router.post(
  "/save-session",
  auth,
  validate(saveSessionSchema),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const { noteId, questions, responses, avgScore, weakConcepts } = req.body;

      // Determine subject from note or use "Voice Recall"
      let subject = "Voice Recall";
      if (noteId) {
        const note = await Note.findOne({ _id: noteId, userId });
        if (note) {
          subject = note.subject || subject;
        }
      }

      // Save VoiceSession
      const session = await VoiceSession.create({
        userId,
        noteId: noteId ? toObjectId(noteId) : null,
        subject,
        questions,
        responses,
        avgScore,
        weakConcepts: [...new Set(weakConcepts)],
      });

      // Create StudySession
      await StudySession.create({
        userId,
        type: "voice",
        subject,
        durationMinutes: Math.max(1, Math.round(questions.length * 3)), // ~3 min per question
      });

      // Update user weak topics
      if (weakConcepts && weakConcepts.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $addToSet: { weakTopics: { $each: weakConcepts } },
        });
      }

      res.status(201).json({
        success: true,
        sessionId: session._id,
        avgScore,
        weakConcepts: session.weakConcepts,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────
// GET /api/voice-recall/history
// Returns: last 10 VoiceSession records
// ─────────────────────────────────────────────────────────

router.get("/history", auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    const sessions = await VoiceSession.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("subject avgScore weakConcepts questions responses createdAt")
      .lean();

    res.json({
      success: true,
      activity: sessions.map((s) => ({
        _id: s._id,
        subject: s.subject,
        avgScore: s.avgScore,
        weakConcepts: s.weakConcepts,
        questionCount: s.questions?.length || 0,
        date: s.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
