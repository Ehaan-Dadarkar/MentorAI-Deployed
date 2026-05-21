const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");

dotenv.config();

const authRoutes = require("./routes/auth");
const tutorRoutes = require("./routes/tutor");
const flashcardRoutes = require("./routes/flashcards");
const quizRoutes = require("./routes/quiz");
const notesRoutes = require("./routes/notes");
const voiceRecallRoutes = require("./routes/voice-recall");
const transcribeRoute = require("./routes/transcribe");
const uploadRoutes = require("./routes/upload");
const dashboardRoutes = require("./routes/dashboard");
const knowledgeGraphRoutes = require("./routes/knowledge-graph");
const settingsRoutes = require("./routes/settings");
const { requestLogger, errorLogger } = require("./middleware/logger");
const { globalLimiter, loginLimiter, rateLimitInfoMiddleware } = require("./middleware/rateLimiter");
const User = require("./models/User");
const { seedDemoNotes } = require("./seeds/demoNotes");

const app = express();
// Trust proxy headers from Vercel/Render
// This ensures we get the real user IP, not Vercel's proxy IP
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@mentorai.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo@1234";

async function ensureDemoAccount() {
  const existingDemo = await User.findOne({ email: DEMO_EMAIL });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  if (existingDemo) {
    await User.updateOne(
      { _id: existingDemo._id },
      {
        $set: {
          isDemo: true,
          name: existingDemo.name || "Demo Account",
          passwordHash,
          openrouterApiKey: existingDemo.openrouterApiKey || "",
        },
      },
    );
    return User.findById(existingDemo._id);
  }

  const demoUser = await User.create({
    name: "Demo Account",
    email: DEMO_EMAIL,
    passwordHash,
    subjects: ["Mathematics", "Physics", "Computer Science"],
    studyGoalMinutes: 45,
    streak: 12,
    weakTopics: ["Calculus", "Memory recall"],
    openrouterApiKey: "",
    isDemo: true,
  });

  return demoUser;
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,
  'https://mentorai.vercel.app',
  'https://mentorai-prod.vercel.app',
  /\.vercel\.app$/
];

// Middleware
app.use(helmet());
// Global limiter - skip handled inside the limiter (e.g. /api/auth/me)
app.use(globalLimiter);
app.use(rateLimitInfoMiddleware);
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(o =>
        typeof o === 'string' ? o === origin : o.test(origin)
      );
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// API Routes
// Auth limiter only on login/register, not on /me or /logout
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);
app.use('/api/auth', authRoutes);
app.use("/api/tutor", tutorRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/voice-recall", voiceRecallRoutes);
app.use("/api/voice/transcribe", transcribeRoute);
app.use("/api/upload", uploadRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/knowledge-graph", knowledgeGraphRoutes);
app.use("/api/settings", settingsRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorLogger);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;
  res.status(status).json({ error: message });
});

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    const demoUser = await ensureDemoAccount();
    await seedDemoNotes(demoUser);
    console.log(`Demo account ready: ${DEMO_EMAIL}`);
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

module.exports = app;
