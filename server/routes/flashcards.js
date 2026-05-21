const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { callOpenRouter } = require("../services/openrouter");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");
const { calculateSM2 } = require("../services/sm2");
const Deck = require("../models/Deck");
const Flashcard = require("../models/Flashcard");
const StudySession = require("../models/StudySession");
const StudyLog = require("../models/StudyLog");

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────

function startOfLocalDay(input = new Date()) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(input, days) {
  const d = new Date(input);
  d.setDate(d.getDate() + days);
  return d;
}

function dateKey(input) {
  const d = new Date(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calculateStreaksFromDateKeys(keys, todayKey) {
  const dateSet = new Set(keys);
  const sorted = [...dateSet].sort();

  // Current streak: consecutive days ending today
  let currentStreak = 0;
  let cursor = startOfLocalDay(new Date(todayKey));
  while (dateSet.has(dateKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest streak: max consecutive run ever
  let longestStreak = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    const current = startOfLocalDay(new Date(key));
    if (!prev) {
      run = 1;
    } else {
      const diffMs = current.getTime() - prev.getTime();
      run = diffMs === 24 * 60 * 60 * 1000 ? run + 1 : 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = current;
  }

  return { currentStreak, longestStreak };
}

function parseFlashcardsFromAi(raw) {
  const sanitizeCard = (card) => ({
    question: String(card.question || "").trim(),
    answer: String(card.answer || "").trim(),
    difficulty: ["easy", "medium", "hard"].includes(card.difficulty)
      ? card.difficulty
      : "medium",
  });

  const tryParse = (value) => {
    if (Array.isArray(value)) return value.map(sanitizeCard);
    if (Array.isArray(value?.flashcards))
      return value.flashcards.map(sanitizeCard);
    return null;
  };

  try {
    const parsed = JSON.parse(raw);
    const cards = tryParse(parsed);
    if (cards) return cards;
  } catch {
    // fall through
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsed = JSON.parse(arrayMatch[0]);
    const cards = tryParse(parsed);
    if (cards) return cards;
  }

  throw new Error("Failed to parse flashcards JSON from AI response");
}

async function generateCardsFromText(text, subject, apiKey) {
  const messages = [
    {
      role: "system",
      content: `You are an expert flashcard generator.
Generate 8-12 high-quality flashcards from the provided text.
Return ONLY a valid JSON array, no markdown, no extra text.
Format:
[
  {
    "question": "string",
    "answer": "string",
    "difficulty": "easy|medium|hard"
  }
]`,
    },
    {
      role: "user",
      content: `Subject: ${subject}\n\nText:\n${text}`,
    },
  ];

  const raw = await callOpenRouter(messages, { temperature: 0.4, apiKey });
  const cards = parseFlashcardsFromAi(raw).filter(
    (card) => card.question && card.answer,
  );

  if (cards.length === 0) {
    throw new Error("AI returned no valid flashcards");
  }

  return cards.slice(0, 12);
}

async function ensureDeckForGeneration(userId, deckId, subject, defaultName) {
  if (deckId) {
    const existing = await Deck.findOne({ _id: deckId, userId });
    if (!existing) {
      const error = new Error("Deck not found");
      error.status = 404;
      throw error;
    }
    return existing;
  }

  return Deck.create({ userId, name: defaultName, subject });
}

async function applyReview({ card, grade }) {
  const sm2 = calculateSM2({
    easeFactor: card.easeFactor,
    interval: card.interval,
    repetitions: card.repetitions,
    grade,
  });

  const mastery = Math.min(
    100,
    Math.round(
      (sm2.easeFactor / 2.5) * (sm2.repetitions / (sm2.repetitions + 1)) * 100,
    ),
  );

  const updatedCard = await Flashcard.findByIdAndUpdate(
    card._id,
    {
      interval: sm2.interval,
      repetitions: sm2.repetitions,
      easeFactor: sm2.easeFactor,
      nextReview: sm2.nextReview,
      mastery,
      lastReviewed: new Date(),
    },
    { returnDocument: "after" },
  );

  return updatedCard;
}

async function getDeckStats(userId, deckId) {
  const now = new Date();
  const statsArray = await Flashcard.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        deckId: new mongoose.Types.ObjectId(deckId),
      },
    },
    {
      $group: {
        _id: "$deckId",
        totalCards: { $sum: 1 },
        dueCards: {
          $sum: { $cond: [{ $lte: ["$nextReview", now] }, 1, 0] },
        },
        masteredCards: {
          $sum: { $cond: [{ $gte: ["$mastery", 80] }, 1, 0] },
        },
      },
    },
  ]);

  return statsArray[0] || { totalCards: 0, dueCards: 0, masteredCards: 0 };
}

// ── GET /api/flashcards/decks ───────────────────────────────

router.get("/decks", auth, async (req, res, next) => {
  try {
    const decks = await Deck.find({ userId: req.userId }).sort({
      updatedAt: -1,
    });
    const deckIds = decks.map((d) => d._id);
    const now = new Date();

    const stats = await Flashcard.aggregate([
      { $match: { userId: req.userId, deckId: { $in: deckIds } } },
      {
        $group: {
          _id: "$deckId",
          totalCards: { $sum: 1 },
          dueCards: {
            $sum: { $cond: [{ $lte: ["$nextReview", now] }, 1, 0] },
          },
          masteredCards: {
            $sum: { $cond: [{ $gte: ["$mastery", 80] }, 1, 0] },
          },
        },
      },
    ]);

    const statsByDeck = new Map(
      stats.map((s) => [
        String(s._id),
        {
          totalCards: s.totalCards,
          dueCards: s.dueCards,
          masteredCards: s.masteredCards,
        },
      ]),
    );

    const result = decks.map((deck) => ({
      ...deck.toObject(),
      stats: statsByDeck.get(String(deck._id)) || {
        totalCards: 0,
        dueCards: 0,
        masteredCards: 0,
      },
    }));

    res.json({ decks: result });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/flashcards/decks ──────────────────────────────

const createDeckSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1),
});

router.post(
  "/decks",
  auth,
  validate(createDeckSchema),
  async (req, res, next) => {
    try {
      const { name, subject } = req.body;
      const deck = await Deck.create({ userId: req.userId, name, subject });
      res.status(201).json({ deck });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/flashcards/decks/:deckId ───────────────────────

router.get("/decks/:deckId", auth, async (req, res, next) => {
  try {
    const deck = await Deck.findOne({
      _id: req.params.deckId,
      userId: req.userId,
    });
    if (!deck) return res.status(404).json({ error: "Deck not found" });

    const cards = await Flashcard.find({
      deckId: deck._id,
      userId: req.userId,
    }).sort({ nextReview: 1 });

    res.json({ deck, cards });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/flashcards/decks/:deckId/weak ──────────────────

router.get("/decks/:deckId/weak", auth, async (req, res, next) => {
  try {
    const deck = await Deck.findOne({
      _id: req.params.deckId,
      userId: req.userId,
    }).select("_id");
    if (!deck) return res.status(404).json({ error: "Deck not found" });

    const cards = await Flashcard.find({
      userId: req.userId,
      deckId: deck._id,
      mastery: { $lt: 40 },
    }).sort({ mastery: 1, nextReview: 1 });

    res.json({ cards });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/flashcards/decks/:deckId/cards (legacy) ────────

router.get("/decks/:deckId/cards", auth, async (req, res, next) => {
  try {
    const cards = await Flashcard.find({
      deckId: req.params.deckId,
      userId: req.userId,
    }).sort({ nextReview: 1 });

    res.json({ cards });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/flashcards/due ─────────────────────────────────

router.get("/due", auth, async (req, res, next) => {
  try {
    const cards = await Flashcard.find({
      userId: req.userId,
      nextReview: { $lte: new Date() },
    })
      .sort({ nextReview: 1 })
      .limit(100);

    res.json({ cards });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/flashcards/decks/:deckId/cards ────────────────

const createCardSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

router.post(
  "/decks/:deckId/cards",
  auth,
  validate(createCardSchema),
  async (req, res, next) => {
    try {
      const deck = await Deck.findOne({
        _id: req.params.deckId,
        userId: req.userId,
      });
      if (!deck) return res.status(404).json({ error: "Deck not found" });

      const card = await Flashcard.create({
        deckId: deck._id,
        userId: req.userId,
        ...req.body,
      });

      res.status(201).json({ card });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/flashcards/decks/:deckId/cards/bulk ───────────

const bulkCreateSchema = z.object({
  cards: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      }),
    )
    .min(1)
    .max(100),
});

router.post(
  "/decks/:deckId/cards/bulk",
  auth,
  validate(bulkCreateSchema),
  async (req, res, next) => {
    try {
      const deck = await Deck.findOne({
        _id: req.params.deckId,
        userId: req.userId,
      });
      if (!deck) return res.status(404).json({ error: "Deck not found" });

      const cardsData = req.body.cards.map((card) => ({
        ...card,
        deckId: deck._id,
        userId: req.userId,
      }));

      const cards = await Flashcard.insertMany(cardsData);
      res.status(201).json({ cards, count: cards.length });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/flashcards/review ─────────────────────────────

const reviewSchema = z.object({
  cardId: z.string().min(1),
  grade: z.union([
    z.number().min(0).max(5),
    z.enum(["missed", "almost", "got_it"]),
  ]),
});

router.post("/review", auth, validate(reviewSchema), async (req, res, next) => {
  try {
    const { cardId, grade } = req.body;

    const card = await Flashcard.findOne({ _id: cardId, userId: req.userId });
    if (!card) return res.status(404).json({ error: "Card not found" });

    const updatedCard = await applyReview({ card, grade });
    const stats = await getDeckStats(req.userId, card.deckId);

    res.json({ card: updatedCard, stats });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/flashcards/cards/:id/review (legacy) ─────────

const legacyReviewSchema = z.object({
  quality: z.number().min(0).max(5),
});

router.patch(
  "/cards/:id/review",
  auth,
  validate(legacyReviewSchema),
  async (req, res, next) => {
    try {
      const card = await Flashcard.findOne({
        _id: req.params.id,
        userId: req.userId,
      });
      if (!card) return res.status(404).json({ error: "Card not found" });

      const updatedCard = await applyReview({ card, grade: req.body.quality });
      const stats = await getDeckStats(req.userId, card.deckId);

      res.json({ card: updatedCard, stats });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/flashcards/generate ───────────────────────────

const generateSchema = z.object({
  text: z.string().min(10),
  subject: z.string().min(1),
  deckId: z.string().min(1).optional(),
});

router.post(
  "/generate",
  auth,
  dynamicAiLimiter,
  validate(generateSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const { text, subject, deckId } = req.body;
      const deck = await ensureDeckForGeneration(
        req.userId,
        deckId,
        subject,
        `${subject} Deck`,
      );

      const generated = await generateCardsFromText(text, subject, access.apiKey);
      const cards = await Flashcard.insertMany(
        generated.map((card) => ({
          deckId: deck._id,
          userId: req.userId,
          question: card.question,
          answer: card.answer,
          difficulty: card.difficulty,
        })),
      );

      res.status(201).json({ deck, cards, count: cards.length });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/flashcards/generate-from-weak ─────────────────

const generateFromWeakSchema = z.object({
  weakConcepts: z.array(z.string().min(1)).min(1).max(50),
  subject: z.string().min(1).default("General"),
  deckId: z.string().min(1).optional(),
});

router.post(
  "/generate-from-weak",
  auth,
  dynamicAiLimiter,
  validate(generateFromWeakSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const { weakConcepts, subject, deckId } = req.body;
      const deck = await ensureDeckForGeneration(
        req.userId,
        deckId,
        subject,
        `${subject} Weak Concepts`,
      );

      const weakText = `Create flashcards focused on these weak concepts:\n${weakConcepts
        .map((concept, i) => `${i + 1}. ${concept}`)
        .join("\n")}`;

      const generated = await generateCardsFromText(weakText, subject, access.apiKey);
      const cards = await Flashcard.insertMany(
        generated.map((card) => ({
          deckId: deck._id,
          userId: req.userId,
          question: card.question,
          answer: card.answer,
          difficulty: card.difficulty,
        })),
      );

      res.status(201).json({ deck, cards, count: cards.length });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/flashcards/ai-suggest ─────────────────────────

const aiSuggestSchema = z.object({
  weakCards: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        mastery: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(100),
});

router.post(
  "/ai-suggest",
  auth,
  dynamicAiLimiter,
  validate(aiSuggestSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const { weakCards } = req.body;
      const input = weakCards
        .map(
          (card, i) =>
            `${i + 1}. Mastery ${card.mastery}%\nQ: ${card.question}\nA: ${card.answer}`,
        )
        .join("\n\n");

      const suggestion = await callOpenRouter(
        [
          {
            role: "system",
            content: `You are an expert university learning coach.
Analyze the student's weak flashcards and produce one short, specific, actionable study recommendation.
Write 3 to 5 sentences.
Focus on: what concepts are weak, why they might be weak, and exactly how to study them next.
Return plain text only.`,
          },
          {
            role: "user",
            content: `Weak cards:\n\n${input}`,
          },
        ],
        { temperature: 0.4, apiKey: access.apiKey },
      );

      res.json({ suggestion: String(suggestion || "").trim() });
    } catch (error) {
      next(error);
    }
  },
);

// ── DELETE /api/flashcards/decks/:deckId ────────────────────

router.delete("/decks/:deckId", auth, async (req, res, next) => {
  try {
    const deck = await Deck.findOneAndDelete({
      _id: req.params.deckId,
      userId: req.userId,
    });

    if (!deck) return res.status(404).json({ error: "Deck not found" });

    await Flashcard.deleteMany({ deckId: deck._id, userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ── DELETE /api/flashcards/cards/:cardId ─────────────────────

router.delete("/cards/:cardId", auth, async (req, res, next) => {
  try {
    const card = await Flashcard.findOneAndDelete({
      _id: req.params.cardId,
      userId: req.userId,
    });
    if (!card) return res.status(404).json({ error: "Card not found" });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/flashcards/session ────────────────────────────

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
      const session = await StudySession.create({
        userId: req.userId,
        type: "flashcard",
        subject: req.body.subject,
        durationMinutes: req.body.durationMinutes,
      });

      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/flashcards/session/complete ────────────────────

const completeSessionSchema = z.object({
  deckId: z.string().min(1),
  reviews: z
    .array(
      z.object({
        cardId: z.string().min(1),
        grade: z.enum(["missed", "almost", "got_it"]),
      }),
    )
    .min(1),
  totalReviewed: z.number().min(1),
});

router.post(
  "/session/complete",
  auth,
  validate(completeSessionSchema),
  async (req, res, next) => {
    try {
      const { deckId, reviews, totalReviewed } = req.body;

      const deck = await Deck.findOne({
        _id: deckId,
        userId: req.userId,
      }).select("_id");
      if (!deck) return res.status(404).json({ error: "Deck not found" });

      const day = startOfLocalDay(new Date());
      const reviewedCount = Math.max(totalReviewed || 0, reviews.length);
      const correctCount = reviews.reduce(
        (sum, r) =>
          r.grade === "almost" || r.grade === "got_it" ? sum + 1 : sum,
        0,
      );
      const accuracy = reviewedCount
        ? Math.round((correctCount / reviewedCount) * 100)
        : 0;

      const log = await StudyLog.create({
        userId: req.userId,
        deckId: deck._id,
        date: day,
        totalReviewed: reviewedCount,
        correctCount,
        accuracy,
        reviews: reviews.map((r) => ({ cardId: r.cardId, grade: r.grade })),
      });

      res.status(201).json({ log });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/flashcards/stats ───────────────────────────────

router.get("/stats", auth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const today = startOfLocalDay(new Date());
    const start = addDays(today, -364);
    const end = addDays(today, 1);

    const [
      dayEntries,
      heatmapAgg,
      totalMastered,
      totalDecks,
      totalReviewedAgg,
    ] = await Promise.all([
      StudyLog.find({ userId }).select("date").lean(),
      StudyLog.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            date: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: "$date",
            count: { $sum: "$totalReviewed" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Flashcard.countDocuments({ userId, mastery: { $gt: 80 } }),
      Deck.countDocuments({ userId }),
      StudyLog.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalReviewed: { $sum: "$totalReviewed" },
          },
        },
      ]),
    ]);

    const uniqueDateKeys = [
      ...new Set(dayEntries.map((entry) => dateKey(entry.date))),
    ];
    const streaks = calculateStreaksFromDateKeys(
      uniqueDateKeys,
      dateKey(today),
    );

    const heatmapMap = new Map(
      heatmapAgg.map((entry) => [dateKey(entry._id), Number(entry.count) || 0]),
    );

    const heatmapData = [];
    for (let offset = 0; offset < 365; offset += 1) {
      const day = addDays(start, offset);
      const key = dateKey(day);
      heatmapData.push({ date: key, count: heatmapMap.get(key) || 0 });
    }

    const totalReviewed = totalReviewedAgg[0]?.totalReviewed || 0;

    res.json({
      stats: {
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
        heatmapData,
        milestones: {
          totalMastered,
          totalReviewed,
          totalDecks,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
