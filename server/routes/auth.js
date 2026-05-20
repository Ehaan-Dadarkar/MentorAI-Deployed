const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const validate = require("../middleware/validate");
const auth = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");

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

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// POST /api/auth/register
router.post(
  "/register",
  authLimiter,
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

      const token = generateToken(user._id);
      setTokenCookie(res, token);

      res.status(201).json({
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

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
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

      const token = generateToken(user._id);
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

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.json({ success: true, message: "Logged out" });
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
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.json({ success: true, user: null });
    }

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) {
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
    const { name, subjects, studyGoalMinutes, openrouterApiKey } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (subjects) updates.subjects = subjects;
    if (studyGoalMinutes) updates.studyGoalMinutes = studyGoalMinutes;
    if (openrouterApiKey !== undefined) {
      updates.openrouterApiKey = String(openrouterApiKey).trim();
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
    }).select("-passwordHash");

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
