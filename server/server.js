const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");

dotenv.config();

const { assertJwtSecret } = require("./services/jwt");

// Fail fast (Backend m20): auth is meaningless without a real JWT
// secret, and a short one is brute-forceable. Refuse to boot rather
// than serve signed tokens under a weak or missing secret. The error
// names the variable only, never its value. NOTE FOR DEPLOY: if the
// Render JWT_SECRET is shorter than 32 characters, this service will
// not boot after this change until that variable is rotated to a
// value at least 32 characters long (rotation invalidates all
// existing tokens, so users simply log in again).
assertJwtSecret();

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
const creditsRoutes = require("./routes/credits");
const { requestLogger, errorLogger } = require("./middleware/logger");
const { globalLimiter, rateLimitInfoMiddleware } = require("./middleware/rateLimiter");
const User = require("./models/User");
const { seedDemoNotes } = require("./seeds/demoNotes");

const app = express();
// Trust proxy headers from Vercel/Render
// This ensures we get the real user IP, not Vercel's proxy IP
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@mentorai.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

async function ensureDemoAccount() {
  const existingDemo = await User.findOne({ email: DEMO_EMAIL });
  if (!DEMO_PASSWORD) {
    console.warn("DEMO_PASSWORD is not set; leaving demo account password unchanged.");
    return existingDemo;
  }
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

const { corsMiddleware } = require("./middleware/cors");
const { csrfOriginCheck } = require("./middleware/csrfOrigin");

// Middleware
app.use(helmet());
// Global limiter - skip handled inside the limiter (e.g. /api/auth/me)
app.use(globalLimiter);
app.use(rateLimitInfoMiddleware);
app.use(corsMiddleware);
// CSRF origin check (Backend M2): state-changing requests must come
// from an allowlisted frontend origin. Mounted here, before every
// route, so no router can forget it; see middleware/csrfOrigin.js.
app.use(csrfOriginCheck);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// API Routes
// Login/register limiting lives on those routes in the auth router;
// mounting it here too would count each failed attempt twice.
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
app.use("/api/credits", creditsRoutes);

// Health check
app.get(["/health", "/healthz", "/api/health"], (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    app: "mentorai-backend",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    database: dbConnected ? "connected" : "disconnected",
  });
});

// Error handling middleware
app.use(errorLogger);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV !== "production";
  res.status(status).json({
    success: false,
    error: isDev ? err.message : "Internal server error",
    ...(isDev ? { stack: err.stack } : {}),
  });
});

// Start listening first, then connect to MongoDB in the background:
// /health must stay reachable exactly when MongoDB is down (the
// audit's point), so a failed or slow connection must neither
// prevent listen nor kill the process. The health endpoint already
// reports 503 "degraded" while disconnected, which is what a
// platform health check needs to tell "process up, database down"
// apart from "process dead". Data routes still fail without a
// database, as before; only the process lifecycle changes.
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Later disconnects are logged, not fatal, for the same reason.
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    const demoUser = await ensureDemoAccount();
    if (demoUser) await seedDemoNotes(demoUser);
    console.log(`Demo account ready: ${DEMO_EMAIL}`);
  })
  .catch((err) => {
    console.error("MongoDB connection error: server continues without a database; /health reports degraded:", err);
  });

module.exports = app;
