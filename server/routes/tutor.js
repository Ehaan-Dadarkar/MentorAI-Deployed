const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { generateFlashcards } = require("../services/ai");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");
const StudySession = require("../models/StudySession");
const Deck = require("../models/Deck");
const Flashcard = require("../models/Flashcard");
const Note = require("../models/Note");
const TutorSessionSummary = require("../models/TutorSessionSummary");

const router = express.Router();

// ── OpenRouter Config ─────────────────────────────────────
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const TUTOR_MODEL =
  process.env.OPENROUTER_TUTOR_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "meta-llama/llama-3.1-8b-instruct";

if (process.env.NODE_ENV !== "production") {
  console.log("Tutor AI Backend: OpenRouter");
  console.log("Tutor Model:", TUTOR_MODEL);
}

// ── Validation Schemas ────────────────────────────────────
const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  context: z.string().optional(),
  noteContext: z.string().optional(),
  activeSessionId: z.string().optional(),
  mode: z.enum(["explain", "socratic"]).optional().default("explain"),
});

const objectIdPattern = /^[a-f\d]{24}$/i;

const renameSessionSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const sessionNotesSchema = z.object({
  noteIds: z.array(z.string().regex(objectIdPattern)).max(50),
});

// ══════════════════════════════════════════════════════════════
// TUTOR SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════

function buildTutorSystemPrompt(context, noteContext, mode) {
  if (mode === "socratic") {
    return [
      "You are a tutor who teaches by asking questions.",
      "",
      "Rules:",
      "- Ask ONE question per response",
      "- Do NOT answer your own question",
      "- Keep response under 2 sentences",
      "- End with a question mark",
      "",
      "If student is stuck after 2 tries:",
      "- Give a short hint",
      "- Ask one follow-up question",
      "",
      "Example:",
      "Student: 'What is recursion?'",
      "You: 'Before we start, what happens when a function calls another function?'",
      "",
      "Bad example (DO NOT DO):",
      "You: 'What is recursion? Recursion is when...' ❌ STOP after the question!",
      "",
      context ? `Topic: ${context}` : "",
      noteContext
        ? `Student notes (reference if helpful):\n${noteContext.slice(0, 3000)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are a clear, direct tutor.",
    "",
    "Structure every answer like this:",
    "1. Core idea (1 sentence)",
    "2. Brief explanation (2-3 sentences)",
    "3. Example (code or analogy)",
    "4. End with: FOLLOW_UPS: [3 specific questions]",
    "",
    "Formatting:",
    "- Use **bold** for key terms",
    "- Use `code` for technical terms",
    "- Use code blocks for examples",
    "",
    "Rules:",
    "- No filler ('Great question!', 'Sure!')",
    "- No text after FOLLOW_UPS line",
    "- For greetings: reply in 1 sentence, no FOLLOW_UPS",
    "",
    "Example:",
    "Student: 'What is a variable?'",
    "You: 'A **variable** is a labeled container that stores data.'",
    "It's like a box with a name tag. You can put something in it, check what's inside, or replace it.",
    "",
    "Example:",
    "```python",
    "age = 25  # variable named 'age' stores 25",
    "age = 26  # now it stores 26",
    "```",
    "",
    "FOLLOW_UPS: [What happens if you use a variable before assigning it?, Can you have two variables with the same name?, What's the difference between a variable and a constant?]",
    "",
    context ? `Topic: ${context}` : "",
    noteContext ? `Student notes:\n${noteContext.slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseFollowUps(fullResponse) {
  const marker = "FOLLOW_UPS:";
  const markerIndex = fullResponse.indexOf(marker);

  if (markerIndex === -1) {
    return {
      content: fullResponse.trim(),
      followUps: [],
    };
  }

  const content = fullResponse.slice(0, markerIndex).trim();
  const followUpsBlock = fullResponse.slice(markerIndex + marker.length).trim();

  const bracketMatch = followUpsBlock.match(/^\[(.*?)\]/s);
  if (!bracketMatch) {
    return { content, followUps: [] };
  }

  const followUps = bracketMatch[1]
    .split(",")
    .map((item) => item.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean)
    .slice(0, 3);

  return { content, followUps };
}

// ── TOKEN SPEED TRACKER ───────────────────────────────
function createTokenTracker(model, mode) {
  let tokenCount = 0;
  let startTime = null;

  return {
    track(delta) {
      if (!delta) return;
      if (!startTime) startTime = Date.now();
      tokenCount++;
    },

    log() {
      if (!startTime || tokenCount === 0) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[TokenTracker] No tokens recorded.");
        }
        return;
      }

      const durationSec = (Date.now() - startTime) / 1000;
      const tokensPerSecond = (tokenCount / durationSec).toFixed(2);

      if (process.env.NODE_ENV !== "production") {
        console.log(`
╔══════════════════════════════════╗
║       TUTOR PERFORMANCE LOG      ║
╠══════════════════════════════════╣
║ Model      : ${(model || "unknown").padEnd(19)}║
║ Mode       : ${(mode || "unknown").padEnd(19)}║
║ Tokens     : ${String(tokenCount).padEnd(19)}║
║ Duration   : ${(durationSec.toFixed(2) + "s").padEnd(19)}║
║ Speed      : ${(tokensPerSecond + " tok/s").padEnd(19)}║
╚══════════════════════════════════╝`);
  }

      return {
        tokenCount,
        durationSec,
        tokensPerSecond: parseFloat(tokensPerSecond),
      };
    },
  };
}

// ══════════════════════════════════════════════════════════════
// POST /api/tutor/chat  —  OpenRouter Streaming
// ══════════════════════════════════════════════════════════════
router.post(
  "/chat",
  auth,
  dynamicAiLimiter,
  validate(chatSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const {
        messages: rawMessages,
        context,
        noteContext,
        activeSessionId,
      } = req.body;
      const messages = rawMessages.filter(
        (m) => m.content && m.content.trim().length > 0,
      );
      const mode = req.body.mode || "explain";

      const systemPrompt = {
        role: "system",
        content: buildTutorSystemPrompt(context, noteContext, mode),
      };

      const trimmedMessages = messages.slice(-10);
      const cleanedMessages = trimmedMessages.filter(
        (m) => m.content && m.content.trim().length > 0,
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const openRouterPayload = {
        model: TUTOR_MODEL,
        messages: [systemPrompt, ...cleanedMessages],
        stream: true,
        temperature: mode === "socratic" ? 0.2 : 0.6,
        top_p: 0.9,
        max_tokens: mode === "socratic" ? 200 : 600,
      };

      const tokenTracker = createTokenTracker(TUTOR_MODEL, mode);

      const streamResponse = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        openRouterPayload,
        {
          responseType: "stream",
          timeout: 60000,
          headers: {
            Authorization: `Bearer ${access.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
            "X-Title": "Mentorai Learning App",
          },
        },
      );

      let buffer = "";
      let fullResponse = "";
      let sentLength = 0;
      let closed = false;

      // ✅ Flag: socratic mode locked after first question — stop streaming
      //    tokens to client but keep reading stream so "end" fires normally
      let socraticLocked = false;

      req.on("close", () => {
        closed = true;
        if (streamResponse?.data && !streamResponse.data.destroyed) {
          streamResponse.data.destroy();
        }
      });

      streamResponse.data.on("data", (chunk) => {
        if (closed) return;

        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed?.choices?.[0]?.delta?.content || "";
            if (!delta) continue;

            fullResponse += delta;
            tokenTracker.track(delta);

            // ── SOCRATIC MODE ──────────────────────────────
            if (mode === "socratic") {
              if (!socraticLocked) {
                // Check if we've hit a question mark
                const questionIndex = fullResponse.indexOf("?");
                if (questionIndex !== -1) {
                  // Lock: trim fullResponse to just the question
                  fullResponse = fullResponse
                    .slice(0, questionIndex + 1)
                    .trim();
                  socraticLocked = true;

                  // Send the final visible token to client
                  if (fullResponse.length > sentLength) {
                    const token = fullResponse.slice(sentLength);
                    sentLength = fullResponse.length;
                    res.write(
                      `event: token\ndata: ${JSON.stringify({ token })}\n\n`,
                    );
                  }
                } else {
                  // No question mark yet — keep streaming to client
                  if (fullResponse.length > sentLength) {
                    const token = fullResponse.slice(sentLength);
                    sentLength = fullResponse.length;
                    res.write(
                      `event: token\ndata: ${JSON.stringify({ token })}\n\n`,
                    );
                  }
                }
              }
              // If socraticLocked: keep reading stream but send nothing more
              continue;
            }

            // ── EXPLAIN MODE ───────────────────────────────
            const markerIndex = fullResponse.indexOf("FOLLOW_UPS:");
            const visibleTarget =
              markerIndex === -1
                ? fullResponse
                : fullResponse.slice(0, markerIndex);

            if (visibleTarget.length > sentLength) {
              const token = visibleTarget.slice(sentLength);
              sentLength = visibleTarget.length;
              res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
            }
          } catch {
            // Ignore malformed SSE chunks
          }
        }
      });

      // ✅ "end" always fires now — no stream.destroy() called
      streamResponse.data.on("end", async () => {
        if (closed) return;

        tokenTracker.log();

        const { content, followUps } = parseFollowUps(fullResponse);
        const safeContent = content || "(No response generated)";

        if (process.env.NODE_ENV !== "production") {
          console.log("[TutorAI] Response:", safeContent.slice(0, 200));
        }

        try {
          const lastUserMessage = [...messages]
            .reverse()
            .find((message) => message.role === "user");

          const rawSnapshot = [
            ...messages,
            {
              role: "assistant",
              content: safeContent,
              followUps,
              createdAt: new Date(),
            },
          ];

          const cleanSnapshot = rawSnapshot.filter(
            (m) => m.content && m.content.trim().length > 0,
          );

          const baseUpdate = {
            promptPreview: (lastUserMessage?.content || "").slice(0, 240),
            responsePreview: safeContent.slice(0, 400),
            followUps,
            messageCount: messages.length,
            messagesSnapshot: cleanSnapshot,
          };

          let summary;

          if (activeSessionId) {
            summary = await TutorSessionSummary.findOneAndUpdate(
              { _id: activeSessionId, userId: req.userId },
              { ...baseUpdate, context: context || "" },
              { new: true },
            );

            if (!summary) {
              throw new Error("Session not found for update");
            }
          } else {
            summary = await TutorSessionSummary.create({
              userId: req.userId,
              name: (
                messages.find((message) => message.role === "user")?.content ||
                ""
              )
                .slice(0, 60)
                .trim(),
              context: context || "",
              ...baseUpdate,
            });
          }

          res.write(
            `event: complete\ndata: ${JSON.stringify({
              content: safeContent,
              followUps,
              sessionId: summary._id,
              name: summary.name,
            })}\n\n`,
          );
        } catch (saveError) {
          console.error("Failed to save tutor session summary:", saveError);
          res.write(
            `event: complete\ndata: ${JSON.stringify({
              content: safeContent,
              followUps,
            })}\n\n`,
          );
        }

        res.end();
      });

      streamResponse.data.on("error", (streamError) => {
        if (closed) return;
        console.error("Tutor stream error:", streamError);
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: "Streaming failed",
          })}\n\n`,
        );
        res.end();
      });
    } catch (error) {
      if (!res.headersSent) {
        return next(error);
      }
      res.write(
        `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`,
      );
      res.end();
    }
  },
);

// ══════════════════════════════════════════════════════════════
// REMAINING ROUTES (unchanged)
// ══════════════════════════════════════════════════════════════

const saveFlashcardSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  subject: z.string().min(1),
});

router.post(
  "/save-flashcard",
  auth,
  validate(saveFlashcardSchema),
  async (req, res, next) => {
    try {
      const { question, answer, subject } = req.body;

      let deck = await Deck.findOne({ userId: req.userId, subject });
      if (!deck) {
        deck = await Deck.create({
          userId: req.userId,
          name: `${subject} Deck`,
          subject,
        });
      }

      const flashcard = await Flashcard.create({
        deckId: deck._id,
        userId: req.userId,
        question,
        answer,
      });

      await Deck.findByIdAndUpdate(deck._id, { $inc: { cardCount: 1 } });

      res.status(201).json({ flashcard });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/sessions", auth, async (req, res, next) => {
  try {
    const sessions = await TutorSessionSummary.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/sessions/:id/rename",
  auth,
  validate(renameSessionSchema),
  async (req, res, next) => {
    try {
      const name = String(req.body?.name || "").trim();

      if (!name) {
        return res.status(400).json({ error: "Name required" });
      }

      const session = await TutorSessionSummary.findOneAndUpdate(
        { _id: req.params.id, userId: req.userId },
        { name },
        { new: true },
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({ session });
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/sessions/:id", auth, async (req, res, next) => {
  try {
    const session = await TutorSessionSummary.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/sessions/:id/notes", auth, async (req, res, next) => {
  try {
    const session = await TutorSessionSummary.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const notes = await Note.find({
      _id: { $in: session.selectedNoteIds },
      userId: req.userId,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false }, deleted: false },
        { isDeleted: { $exists: false }, deleted: { $exists: false } },
      ],
    }).select("_id title subject content tags");

    res.json({ notes });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/sessions/:id/notes",
  auth,
  validate(sessionNotesSchema),
  async (req, res, next) => {
    try {
      const { noteIds } = req.body;

      const uniqueNoteIds = [...new Set(noteIds)];
      const ownedNotesCount = await Note.countDocuments({
        _id: {
          $in: uniqueNoteIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
        userId: req.userId,
        $or: [
          { isDeleted: false },
          { isDeleted: { $exists: false }, deleted: false },
          {
            isDeleted: { $exists: false },
            deleted: { $exists: false },
          },
        ],
      });

      if (ownedNotesCount !== uniqueNoteIds.length) {
        return res.status(400).json({
          error: "One or more noteIds are invalid or inaccessible",
        });
      }

      const session = await TutorSessionSummary.findOneAndUpdate(
        { _id: req.params.id, userId: req.userId },
        { selectedNoteIds: uniqueNoteIds },
        { new: true },
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({
        success: true,
        selectedNoteIds: session.selectedNoteIds,
      });
    } catch (error) {
      next(error);
    }
  },
);

const genFlashcardsSchema = z.object({
  content: z.string().min(10),
  subject: z.string().min(1),
  count: z.number().min(1).max(30).optional().default(10),
});

router.post(
  "/generate-flashcards",
  auth,
  dynamicAiLimiter,
  validate(genFlashcardsSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const { content, subject, count } = req.body;
      const flashcards = await generateFlashcards(content, subject, count, {
        apiKey: access.apiKey,
      });
      res.json({ flashcards });
    } catch (error) {
      next(error);
    }
  },
);

const sessionSchema = z.object({
  subject: z.string().min(1),
  durationMinutes: z.number().min(0),
});

router.post(
  "/session",
  auth,
  validate(sessionSchema),
  async (req, res, next) => {
    try {
      const { subject, durationMinutes } = req.body;

      const session = await StudySession.create({
        userId: req.userId,
        type: "tutor",
        subject,
        durationMinutes,
      });

      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
