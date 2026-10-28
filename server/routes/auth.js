const express = require("express");
const bcrypt = require("bcryptjs");
const { signToken, verifyToken } = require("../services/jwt");
const { z } = require("zod");
const User = require("../models/User");
const validate = require("../middleware/validate");
const auth = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimiter");
const { encryptKey } = require("../services/keyCrypto");

const router = express.Router();

const signupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

const generateToken = (userId, tokenVersion = 0) => {
  return signToken(userId, tokenVersion);
};

const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
};

// POST /api/auth/register
router.post(
  "/register",
  loginLimiter,
  validate(signupSchema),
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res
          .status(409)
          .json({ success: false, message: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, passwordHash });

      const token = generateToken(user._id, user.tokenVersion ?? 0);
      setTokenCookie(res, token);

      // re-read with the private field selected so the client gets an accurate boolean
      const freshUser = await User.findById(user._id).select('+openrouterApiKey');

      res.status(201).json({
        success: true,
        user: {
          id: freshUser._id,
          name: freshUser.name,
          email: freshUser.email,
          subjects: freshUser.subjects,
          studyGoalMinutes: freshUser.studyGoalMinutes,
          streak: freshUser.streak,
          weakTopics: freshUser.weakTopics,
          isDemo: freshUser.isDemo,
          hasOpenrouterApiKey: Boolean(freshUser.openrouterApiKey),
          createdAt: freshUser.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/login
router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select('+openrouterApiKey');
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      const token = generateToken(user._id, user.tokenVersion ?? 0);
      setTokenCookie(res, token);

      res.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          subjects: user.subjects,
          studyGoalMinutes: user.studyGoalMinutes,
          streak: user.streak,
          weakTopics: user.weakTopics,
          isDemo: user.isDemo,
          hasOpenrouterApiKey: Boolean(user.openrouterApiKey),
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/demo-login
// Logs in as the demo account without the client knowing any password.
// This is deliberately passwordless on the client side: the demo account
// is a public try-it account, and its password must never ship in the
// client bundle (see Frontend C1). The account is safe to expose this
// way only because every restricted action is guarded server-side on
// the isDemo flag (profile/settings changes, note creation, PDF import).
// Rate-limited like password login; returns 503 if no demo account
// exists yet (it is created at server boot via ensureDemoAccount).
router.post("/demo-login", loginLimiter, async (_req, res, next) => {
  try {
    const demoEmail = process.env.DEMO_EMAIL || "demo@mentorai.app";
    const user = await User.findOne({
      email: demoEmail,
      isDemo: true,
    }).select("+openrouterApiKey");
    if (!user) {
      return res.status(503).json({
        success: false,
        message: "Demo account is not available",
      });
    }

    const token = generateToken(user._id, user.tokenVersion ?? 0);
    setTokenCookie(res, token);

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subjects: user.subjects,
        studyGoalMinutes: user.studyGoalMinutes,
        streak: user.streak,
        weakTopics: user.weakTopics,
        isDemo: user.isDemo,
        hasOpenrouterApiKey: Boolean(user.openrouterApiKey),
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

const clearTokenCookie = (res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
};

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  clearTokenCookie(res);
  res.json({ success: true, message: "Logged out" });
});

// POST /api/auth/logout-everywhere
// Session revocation (Backend M8): bumps the user's tokenVersion,
// so every token issued before this call — on every device, including
// a stolen one — fails the middleware version check from now on.
// Plain /logout only clears this browser's cookie. The demo account
// is deliberately not blocked here: it is a shared try-it account
// and re-login is one passwordless click.
router.post("/logout-everywhere", auth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
    clearTokenCookie(res);
    res.json({ success: true, message: "Logged out everywhere" });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/change-password
// No password-change endpoint existed, so there was nothing to bump
// the version on (Backend M8). This endpoint verifies the current
// password, hashes the new one, and bumps tokenVersion, so every
// other session — including a stolen token — dies with the change.
// The current session's token dies too, so the cookie is cleared and
// the client must log in again with the new password. Demo is
// blocked, like profile changes: the demo password is
// operator-managed via DEMO_PASSWORD at boot.
router.post("/change-password", auth, validate(changePasswordSchema), async (req, res, next) => {
  try {
    if (req.user.isDemo) {
      return res
        .status(403)
        .json({ success: false, error: "Demo account settings cannot be changed." });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId).select("+passwordHash");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      // 400, not 401: the token already passed the auth middleware, so a
      // wrong current password is a bad request body, not a dead session.
      // A 401 here would trip the client's global session-expired handler
      // and log the user out over a typo, with the password unchanged.
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(req.userId, {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
    });
    clearTokenCookie(res);
    res.json({ success: true, message: "Password changed. Please log in again." });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get("/me", async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.json({ success: true, user: null });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return res.json({ success: true, user: null });
    }

    const user = await User.findById(decoded.userId)
      .select("-passwordHash")
      .select("+openrouterApiKey");
    if (!user) {
      return res.json({ success: true, user: null });
    }

    // Same revocation check as the auth middleware: a stale-version
    // token reads as no user here, so /me cannot resurrect it.
    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.json({ success: true, user: null });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subjects: user.subjects,
        studyGoalMinutes: user.studyGoalMinutes,
        streak: user.streak,
        weakTopics: user.weakTopics,
        lastStudyDate: user.lastStudyDate,
        isDemo: user.isDemo,
        hasOpenrouterApiKey: Boolean(user.openrouterApiKey),
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/profile
router.patch("/profile", auth, async (req, res, next) => {
  try {
    if (req.user.isDemo) {
      return res
        .status(403)
        .json({ success: false, error: "Demo account settings cannot be changed." });
    }

    const { name, subjects, studyGoalMinutes, openrouterApiKey } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (subjects) updates.subjects = subjects;
    if (studyGoalMinutes) updates.studyGoalMinutes = studyGoalMinutes;
    if (openrouterApiKey !== undefined) {
      // Encrypted at rest when KEY_ENCRYPTION_KEY is set; the
      // hasOpenrouterApiKey boolean below still works either way,
      // because an encrypted value is a non-empty string.
      updates.openrouterApiKey = encryptKey(String(openrouterApiKey).trim());
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
    })
      .select("-passwordHash")
      .select("+openrouterApiKey");

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subjects: user.subjects,
        studyGoalMinutes: user.studyGoalMinutes,
        streak: user.streak,
        weakTopics: user.weakTopics,
        lastStudyDate: user.lastStudyDate,
        isDemo: user.isDemo,
        hasOpenrouterApiKey: Boolean(user.openrouterApiKey),
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
