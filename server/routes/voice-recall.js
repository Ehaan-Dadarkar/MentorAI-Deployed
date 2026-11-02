const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { requireOpenRouterAccess, refundCreditSpend } = require("../services/openrouterAccess");
const {
  generateVoiceRecallQuestions,
  evaluateVoiceAnswer,
} = require("../services/ai");
const { usageCallbackFor } = require("../services/usage");
const VoiceSession = require("../models/VoiceSession");
const Note = require("../models/Note");
const User = require("../models/User");
const StudySession = require("../models/StudySession");

const router = express.Router();

function toObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

// M5: voice questions are generated from a bounded window of the note so
// the prompt leaves room for the model's answer. The window is disclosed
// to the client as questionSource on /generate-questions.
const VOICE_SOURCE_MAX_CHARS = 4000;

// H8: a draft VoiceSession is created by /generate-questions holding the
// questions AND their key points. /evaluate grades against the stored key
// points only. The draft carries avgScore -1 ("not yet scored") so it
// stays out of /history until /save-session finalizes it.
const DRAFT_AVG_SCORE = -1;
// Abandoned drafts older than this are cleaned up on each generation.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// M14: ai.js answers this exact object when its own parse of the provider
// JSON fails. It is indistinguishable from a genuine fail on the wire, so
// match the full signature here and surface it as "unevaluated" (no score)
// instead of recording a permanent 0/"incorrect". Fragile by construction
// — the durable fix is for ai.js to throw a typed error on parse failure
// instead of returning a fake result.
function isEvaluationParseFallback(evaluation) {
  return (
    !!evaluation &&
    evaluation.verdict === "incorrect" &&
    evaluation.score === 0 &&
    evaluation.whatWasCorrect === "" &&
    evaluation.improvement === "Please try again" &&
    evaluation.encouragement === "You can do better!"
  );
}

function unevaluatedResult() {
  return {
    score: null,
    verdict: "unevaluated",
    whatWasCorrect: "",
    whatWasMissed: [],
    improvement: "",
    encouragement: "",
  };
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
        await refundCreditSpend(req);
        return res.status(404).json({
          success: false,
          message: "Note not found",
        });
      }

      if (!note.content || note.content.length < 10) {
        await refundCreditSpend(req);
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

      // Truncate to a bounded window to leave room for AI response
      // (M5: the window is disclosed to the client as questionSource).
      const truncatedContent = plainContent.substring(0, VOICE_SOURCE_MAX_CHARS);

      if (process.env.NODE_ENV !== "production") {
        console.log("Plain content preview:", truncatedContent.substring(0, 300));
      }

      if (truncatedContent.length < 10) {
        await refundCreditSpend(req);
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
        { apiKey: access.apiKey, onUsage: usageCallbackFor(req.userId, "voice-recall-questions") },
      );

      if (!Array.isArray(questions) || questions.length === 0) {
        await refundCreditSpend(req);
        return res.status(502).json({
          success: false,
          message: "Question generation failed. Please try again.",
        });
      }

      // H8: persist the generated questions AND their key points
      // server-side. /evaluate grades against these stored key points;
      // client-supplied key points are never trusted (a devtools user
      // could otherwise forge keys matching their answer -> always 100%).
      const draft = await VoiceSession.create({
        userId: req.userId,
        noteId: toObjectId(noteId),
        subject: note.subject || "Voice Recall",
        questions: questions.map((q) => String(q.question || "")),
        responses: questions.map((q) => ({
          question: String(q.question || ""),
          expectedConcepts: Array.isArray(q.keyPoints)
            ? q.keyPoints.map(String)
            : [],
        })),
        avgScore: DRAFT_AVG_SCORE,
        weakConcepts: [],
      });

      // Best-effort cleanup of this user's abandoned drafts. Only draft
      // rows (avgScore -1) are ever matched — finalized sessions are
      // untouched.
      VoiceSession.deleteMany({
        userId: req.userId,
        avgScore: DRAFT_AVG_SCORE,
        createdAt: { $lt: new Date(Date.now() - DRAFT_TTL_MS) },
      }).catch(() => {});

      res.json({
        success: true,
        questions,
        questionSetId: draft._id,
        // M5: honest disclosure of the source window used for generation.
        questionSource: {
          usedChars: truncatedContent.length,
          totalChars: plainContent.length,
          truncated: plainContent.length > truncatedContent.length,
        },
      });
    } catch (error) {
      await refundCreditSpend(req);
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /api/voice-recall/evaluate
// Input: { questionSetId, questionIndex, spokenAnswer, confidence }
// The grading key points come from the server-side draft created by
// /generate-questions — the body carries no answer key (H8).
// Output: evaluation object
// ─────────────────────────────────────────────────────────

const evaluateSchema = z.object({
  questionSetId: z.string().min(1),
  questionIndex: z.number().int().min(0).max(50),
  spokenAnswer: z.string().max(12000),
  confidence: z.number().min(1).max(5),
});

router.post(
  "/evaluate",
  auth,
  dynamicAiLimiter,
  validate(evaluateSchema),
  async (req, res, next) => {
    try {
      const { questionSetId, questionIndex, spokenAnswer, confidence } = req.body;

      // H8: the grading key comes from the server-side draft created by
      // /generate-questions — never from the request body, so forged
      // client key points cannot buy a score.
      let draftId;
      try {
        draftId = toObjectId(questionSetId);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid question set id",
        });
      }
      const draft = await VoiceSession.findOne({
        _id: draftId,
        userId: req.userId,
      });
      if (!draft) {
        return res.status(404).json({
          success: false,
          message:
            "Question set not found or expired. Please generate questions again.",
        });
      }
      if (
        draft.avgScore !== DRAFT_AVG_SCORE ||
        questionIndex >= draft.questions.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This question set can no longer be evaluated. Please generate questions again.",
        });
      }
      const question = draft.questions[questionIndex];
      const storedKeyPoints =
        draft.responses[questionIndex]?.expectedConcepts || [];

      // If answer is empty or whitespace, skip evaluation
      if (!spokenAnswer || spokenAnswer.trim() === "") {
        return res.json({
          success: true,
          evaluation: {
            score: 0,
            verdict: "skipped",
            whatWasCorrect: "",
            whatWasMissed: storedKeyPoints,
            improvement: "Review this concept and try again",
            encouragement: "",
          },
        });
      }

      // Key gate (AI/data C2): without this, production evaluation
      // reached OpenRouter with no key and 500'd for every user.
      // Demo users get the shared env key here; users with no key
      // get a 402 instead of a 500. The empty-answer skip above
      // stays first: it spends no AI call, so it needs no key.
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      // Evaluate via OpenRouter
      const evaluation = await evaluateVoiceAnswer(
        question,
        storedKeyPoints,
        spokenAnswer,
        confidence,
        { apiKey: access.apiKey, onUsage: usageCallbackFor(req.userId, "voice-recall-evaluate") },
      );

      // M14: a provider-side parse failure must not become a permanent
      // failed answer — record it as unevaluated (no score) so the
      // client can offer a re-evaluation.
      const safeEvaluation = isEvaluationParseFallback(evaluation)
        ? unevaluatedResult()
        : evaluation;

      res.json({
        success: true,
        evaluation: safeEvaluation,
      });
    } catch (error) {
      await refundCreditSpend(req);
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
  questionSetId: z.string().optional(),
  questions: z.array(z.string()),
  responses: z.array(
    z.object({
      question: z.string(),
      spokenAnswer: z.string(),
      // M14: unevaluated responses carry no score.
      score: z.number().min(0).max(100).nullable(),
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
      const {
        noteId,
        questionSetId,
        questions,
        responses,
        avgScore,
        weakConcepts,
      } = req.body;

      // Determine subject from note or use "Voice Recall"
      let subject = "Voice Recall";
      if (noteId) {
        const note = await Note.findOne({ _id: noteId, userId });
        if (note) {
          subject = note.subject || subject;
        }
      }

      const weakConceptsDeduped = [...new Set(weakConcepts)];

      // H8: when the client carries the draft created by
      // /generate-questions, finalize it in place instead of creating a
      // second document — the stored key points stay the grading source.
      let session;
      if (questionSetId) {
        let draftId;
        try {
          draftId = toObjectId(questionSetId);
        } catch {
          return res.status(400).json({
            success: false,
            message: "Invalid question set id",
          });
        }
        session = await VoiceSession.findOneAndUpdate(
          { _id: draftId, userId, avgScore: DRAFT_AVG_SCORE },
          {
            subject,
            questions,
            responses,
            avgScore,
            weakConcepts: weakConceptsDeduped,
            completedAt: new Date(),
          },
          { new: true },
        );
        if (!session) {
          return res.status(404).json({
            success: false,
            message: "Question set not found or already saved.",
          });
        }
      } else {
        // Save VoiceSession
        session = await VoiceSession.create({
          userId,
          noteId: noteId ? toObjectId(noteId) : null,
          subject,
          questions,
          responses,
          avgScore,
          weakConcepts: weakConceptsDeduped,
        });
      }

      // Create StudySession
      await StudySession.create({
        userId,
        type: "voice",
        subject,
        durationMinutes: Math.max(1, Math.round(questions.length * 3)), // ~3 min per question
      });

      // Update user weak topics
      if (weakConceptsDeduped.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $addToSet: { weakTopics: { $each: weakConceptsDeduped } },
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

    // Drafts (avgScore -1: created by /generate-questions, not yet
    // finalized by /save-session) are not history.
    const sessions = await VoiceSession.find({
      userId,
      avgScore: { $gte: 0 },
    })
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
