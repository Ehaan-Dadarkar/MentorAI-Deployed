const rateLimit = require("express-rate-limit");
const MongoStore = require("rate-limit-mongo");

// ─── MongoDB Store Factory ───────────────────────────────────────────────
// Creates MongoDB-backed stores for persistence; falls back to memory on error
const makeMongoStore = (expireMs) => {
  try {
    return new MongoStore({
      uri: process.env.MONGO_URI,
      collectionName: 'rateLimits',
      expireTimeMs: expireMs,
      errorHandler: (err) => {
        console.error('[RateLimit] MongoDB store error:', err.message);
      }
    });
  } catch (err) {
    console.warn('[RateLimit] MongoDB store failed, using memory store:', err.message);
    return undefined; // falls back to memory store
  }
};

// ─── TIER 1: Global limiter (applies to ALL routes) ──────────────────────
// 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: makeMongoStore(15 * 60 * 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please wait 15 minutes before trying again.',
  },
});

// ─── TIER 2: Auth limiter (login/register) ────────────────────────────────
// 10 attempts per 15 minutes per IP (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: makeMongoStore(15 * 60 * 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please wait 15 minutes.',
  },
});

// ─── TIER 3: AI limiter for users WITHOUT their own API key ──────────────
// 10 AI requests per hour (heavy restriction on test/demo users)
const aiLimiterStrict = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  store: makeMongoStore(60 * 60 * 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error:
      'AI request limit reached. Add your own OpenRouter API key in Settings to remove limits.',
    addKeyPrompt: true,
  },
});

// ─── TIER 4: AI limiter for users WITH their own API key ─────────────────
// 200 AI requests per hour (generous, they pay for it themselves)
const aiLimiterRelaxed = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  store: makeMongoStore(60 * 60 * 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'You have reached 200 AI requests per hour.',
  },
});

// ─── TIER 5: Demo account limiter ────────────────────────────────────────
// 5 AI requests per hour for demo@mentorai.app
const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  store: makeMongoStore(60 * 60 * 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demo account limit reached. Register a free account or add your own API key.',
    isDemo: true,
  },
});

// ─── Dynamic AI limiter middleware ───────────────────────────────────────
// This is the SMART middleware that decides which limiter to apply
const dynamicAiLimiter = (req, res, next) => {
  // If demo account → strictest limits
  if (req.user && req.user.email === 'demo@mentorai.app') {
    return demoLimiter(req, res, next);
  }

  // If user has their own API key → relaxed limits
  if (req.user && req.user.openrouterApiKey) {
    return aiLimiterRelaxed(req, res, next);
  }

  // Default → strict limits
  return aiLimiterStrict(req, res, next);
};

// Middleware to expose rate limit info to responses
const rateLimitInfoMiddleware = (req, res, next) => {
  // Attach a helper to res so routes can send rate limit info when desired
  res.setRateLimitHeaders = () => {
    try {
      const rl = req.rateLimit;
      if (!rl) return;

      // Standard headers
      if (rl.limit != null) res.setHeader('X-RateLimit-Limit', String(rl.limit));
      if (rl.remaining != null) res.setHeader('X-RateLimit-Remaining', String(rl.remaining));

      // Try to provide a reset timestamp (in seconds)
      if (rl.resetTime) {
        const resetTs = new Date(rl.resetTime).getTime();
        if (!Number.isNaN(resetTs)) {
          res.setHeader('X-RateLimit-Reset', String(Math.floor(resetTs / 1000)));
        }
      }
    } catch (e) {
      // Non-fatal: don't break response if headers fail
    }
  };

  next();
};

module.exports = {
  globalLimiter,
  authLimiter,
  aiLimiterStrict,
  aiLimiterRelaxed,
  demoLimiter,
  dynamicAiLimiter,
  rateLimitInfoMiddleware,
};