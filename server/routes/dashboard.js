const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const User = require("../models/User");
const Flashcard = require("../models/Flashcard");
const Deck = require("../models/Deck");
const Quiz = require("../models/Quiz");
const StudySession = require("../models/StudySession");

const router = express.Router();

// ── Helpers ────────────────────────────────────────────

function toObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

/** Calculate streak: consecutive days (ending today or yesterday) with ≥1 study session */
async function calculateStreak(userId) {
  // Get distinct study dates, newest first
  const raw = await StudySession.aggregate([
    { $match: { userId: toObjectId(userId) } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  if (raw.length === 0) return 0;

  const dates = raw.map((r) => r._id); // ["2026-03-08", "2026-03-07", ...]
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const fmt = (d) => d.toISOString().split("T")[0];
  const todayStr = fmt(today);
  const yesterdayStr = fmt(yesterday);

  // Streak must start from today or yesterday
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + "T00:00:00Z");
    const curr = new Date(dates[i] + "T00:00:00Z");
    const diffDays = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ── Seed realistic test data ───────────────────────────

async function seedIfEmpty(userId) {
  const [sessionCount, quizCount, cardCount] = await Promise.all([
    StudySession.countDocuments({ userId }),
    Quiz.countDocuments({ userId }),
    Flashcard.countDocuments({ userId }),
  ]);

  if (sessionCount > 0 || quizCount > 0 || cardCount > 0) return;

  const oid = toObjectId(userId);
  const now = new Date();
  const subjects = [
    "Linear Algebra",
    "Organic Chemistry",
    "Data Structures",
    "Cell Biology",
    "Microeconomics",
  ];

  // ── Create Decks + Flashcards ────────────────────────
  const decks = [];
  const flashcards = [];
  const deckData = [
    { name: "Matrix Operations", subject: "Linear Algebra", avgMastery: 72 },
    { name: "Functional Groups", subject: "Organic Chemistry", avgMastery: 35 },
    { name: "Trees & Graphs", subject: "Data Structures", avgMastery: 88 },
    { name: "Mitosis & Meiosis", subject: "Cell Biology", avgMastery: 25 },
    { name: "Supply & Demand", subject: "Microeconomics", avgMastery: 60 },
  ];

  for (const dd of deckData) {
    const deckId = new mongoose.Types.ObjectId();
    const cardCountForDeck = 8;
    decks.push({
      _id: deckId,
      userId: oid,
      name: dd.name,
      subject: dd.subject,
      cardCount: cardCountForDeck,
      masteryAvg: dd.avgMastery,
    });

    for (let c = 0; c < cardCountForDeck; c++) {
      const mastery = Math.max(
        0,
        Math.min(100, dd.avgMastery + Math.floor(Math.random() * 30 - 15)),
      );
      const daysAgo = Math.floor(Math.random() * 7);
      const reviewed = new Date(now);
      reviewed.setDate(reviewed.getDate() - daysAgo);

      flashcards.push({
        deckId,
        userId: oid,
        question: `${dd.name} — Question ${c + 1}`,
        answer: `Answer for ${dd.name} Q${c + 1}`,
        difficulty: ["easy", "medium", "hard"][Math.floor(Math.random() * 3)],
        mastery,
        interval: Math.ceil(mastery / 20),
        repetitions: Math.floor(mastery / 25),
        easeFactor: 2.5,
        nextReview: new Date(
          now.getTime() + Math.floor(Math.random() * 3) * 86400000,
        ),
        lastReviewed: reviewed,
      });
    }
  }

  // ── Create Quizzes ───────────────────────────────────
  const quizzes = [];
  const quizSeed = [
    { subject: "Linear Algebra", score: 70, weakTopics: ["Eigenvalues"] },
    {
      subject: "Organic Chemistry",
      score: 45,
      weakTopics: ["Stereochemistry", "Nomenclature"],
    },
    { subject: "Data Structures", score: 90, weakTopics: [] },
    { subject: "Cell Biology", score: 50, weakTopics: ["Cell Signaling"] },
    { subject: "Microeconomics", score: 65, weakTopics: ["Elasticity"] },
    {
      subject: "Organic Chemistry",
      score: 40,
      weakTopics: ["Reaction Mechanisms"],
    },
    { subject: "Cell Biology", score: 55, weakTopics: ["Membrane Transport"] },
  ];

  for (let i = 0; i < quizSeed.length; i++) {
    const qs = quizSeed[i];
    const completedAt = new Date(now);
    completedAt.setDate(completedAt.getDate() - Math.floor(i * 0.8));
    completedAt.setHours(completedAt.getHours() - i);

    const questionCount = 10;
    const correctCount = Math.round((qs.score / 100) * questionCount);
    const questions = [];
    for (let q = 0; q < questionCount; q++) {
      const correct = q < correctCount;
      questions.push({
        question: `${qs.subject} — Q${q + 1}`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: 0,
        userAnswer: correct ? 0 : 1,
        explanation: `Explanation for Q${q + 1}`,
        topic:
          qs.weakTopics.length > 0
            ? qs.weakTopics[q % qs.weakTopics.length]
            : qs.subject,
      });
    }

    quizzes.push({
      userId: oid,
      subject: qs.subject,
      questions,
      score: qs.score,
      timeTaken: 180 + Math.floor(Math.random() * 300),
      weakTopics: qs.weakTopics,
      completedAt,
    });
  }

  // ── Create Study Sessions (last 10 days, streak-friendly) ──
  const sessions = [];
  const types = ["flashcard", "quiz", "voice", "tutor"];
  for (let d = 0; d < 10; d++) {
    // Skip day 8 to create a realistic streak of 8 days
    if (d === 8) continue;
    const sessionsPerDay = d < 3 ? 2 : 1;
    for (let s = 0; s < sessionsPerDay; s++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(9 + s * 4, Math.floor(Math.random() * 60), 0, 0);
      sessions.push({
        userId: oid,
        type: types[Math.floor(Math.random() * types.length)],
        subject: subjects[Math.floor(Math.random() * subjects.length)],
        durationMinutes: 15 + Math.floor(Math.random() * 50),
        date,
      });
    }
  }

  await Promise.all([
    Deck.insertMany(decks),
    Flashcard.insertMany(flashcards),
    Quiz.insertMany(quizzes),
    StudySession.insertMany(sessions),
  ]);

  // Update user streak
  await User.findByIdAndUpdate(userId, { streak: 8 });

  if (process.env.NODE_ENV !== "production") {
    console.log(`[dashboard] Seeded test data for user ${userId}`);
  }
}

// ── Routes ─────────────────────────────────────────────

/**
 * GET /api/dashboard/stats
 * Returns: { streak, quizAccuracy, cardsMastered, studyTimeMinutes }
 */
router.get("/stats", auth, async (req, res, next) => {
  try {
    const userId = req.userId;
    // Only seed test data in development
    if (process.env.NODE_ENV !== 'production') {
      await seedIfEmpty(userId);
    }

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [streak, cardsMastered, completedQuizzes, weekStudy] =
      await Promise.all([
        calculateStreak(userId),
        Flashcard.countDocuments({ userId, mastery: { $gte: 80 } }),
        Quiz.find({ userId, completedAt: { $ne: null } })
          .select("score")
          .lean(),
        StudySession.aggregate([
          {
            $match: {
              userId: toObjectId(userId),
              date: { $gte: weekAgo },
            },
          },
          { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
        ]),
      ]);

    const quizAccuracy =
      completedQuizzes.length > 0
        ? Math.round(
            completedQuizzes.reduce((sum, q) => sum + (q.score || 0), 0) /
              completedQuizzes.length,
          )
        : 0;

    const studyTimeMinutes = weekStudy.length > 0 ? weekStudy[0].total : 0;

    res.json({
      success: true,
      streak,
      quizAccuracy,
      cardsMastered,
      studyTimeMinutes,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/chart
 * Returns: [{ date: "Mon", mastery: 72 }, ...] for last 7 days
 * mastery = average flashcard mastery score reviewed on that day
 */
router.get("/chart", auth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Get study sessions from last 7 days
    const sessions = await StudySession.find({
      userId,
      date: { $gte: sevenDaysAgo },
    }).select("date durationMinutes").lean();

    // Map date -> total minutes
    const minutesByDate = new Map();
    sessions.forEach((s) => {
      const dateKey = new Date(s.date).toISOString().split("T")[0];
      const current = minutesByDate.get(dateKey) || 0;
      minutesByDate.set(dateKey, current + (s.durationMinutes || 0));
    });

    // Generate 7-day chart
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const chart = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateKey = d.toISOString().split("T")[0];

      chart.push({
        day: dayNames[d.getDay()],
        date: dateKey,
        minutes: minutesByDate.get(dateKey) || 0,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Dashboard Chart]", chart); // Debug log
    }

    res.json({ success: true, chart });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/weak-topics
 * Returns: [{ topic, type: "quiz"|"flashcard", score }]
 *   Quiz: subjects where avg score < 60%
 *   Flashcard: decks where avg mastery < 40%
 */
router.get("/weak-topics", auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Quiz weak topics: subjects with avg score < 60
    const quizWeak = await Quiz.aggregate([
      {
        $match: {
          userId: toObjectId(userId),
          completedAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$subject",
          avgScore: { $avg: "$score" },
        },
      },
      {
        $match: { avgScore: { $lt: 60 } },
      },
      { $sort: { avgScore: 1 } },
    ]);

    // Flashcard weak topics: decks with masteryAvg < 40
    const flashcardWeak = await Deck.find({
      userId,
      masteryAvg: { $lt: 40 },
      cardCount: { $gt: 0 },
    })
      .select("name subject masteryAvg")
      .sort({ masteryAvg: 1 })
      .lean();

    const weakTopics = [
      ...quizWeak.map((q) => {
        const score = Math.round(q.avgScore);
        return {
          topic: q._id,
          type: "quiz",
          source: "quiz",
          score,
          metric: score,
          metricLabel: `${score}% quiz accuracy`,
        };
      }),
      ...flashcardWeak.map((d) => {
        const score = Math.round(d.masteryAvg);
        return {
          topic: d.subject || d.name,
          type: "flashcard",
          source: "flashcard",
          score,
          metric: score,
          metricLabel: `${score}% mastery`,
        };
      }),
    ].sort((a, b) => a.score - b.score);

    res.json({ success: true, weakTopics });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/activity
 * Returns last 10 StudySession records for the user
 */
router.get("/activity", auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    const sessions = await StudySession.find({ userId })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    const typeDesc = {
      quiz: "Completed a quiz",
      flashcard: "Reviewed flashcards",
      voice: "Practiced voice recall",
      tutor: "Chatted with AI tutor",
    };

    const activity = sessions.map((s) => ({
      id: s._id,
      type: s.type,
      description: `${typeDesc[s.type] || "Studied"} — ${s.subject}`,
      subject: s.subject,
      durationMinutes: s.durationMinutes,
      date: s.date,
    }));

    res.json({ success: true, activity });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/focus-topics
 * Returns top decks by mastery for focus tracking
 */
router.get("/focus-topics", auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    const decks = await Deck.find({ userId, cardCount: { $gt: 0 } })
      .select("name subject masteryAvg cardCount")
      .sort({ masteryAvg: -1 })
      .limit(8)
      .lean();

    const focusTopics = decks.map((d) => ({
      subject: d.subject || d.name,
      mastery: d.masteryAvg || 0,
      cardCount: d.cardCount,
    }));

    res.json({ success: true, focusTopics });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
