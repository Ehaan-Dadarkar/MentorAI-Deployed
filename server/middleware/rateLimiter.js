const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// ─── KEY GENERATORS ───────────────────────────────────────────────────────
// SECURITY (rate-limit keying fix, Oct 2026): never hand-parse
// X-Forwarded-For or X-Real-IP here. Either header is client-forgeable,
// so a key built from it lets any client rotate its limiter bucket at
// will. server.js sets `trust proxy` (1 hop: Render), so Express already
// resolves the proxy-aware client address into req.ip — use that, and
// only that, for unauthenticated buckets.
//
// Authenticated buckets are keyed by user id, not by IP at all:
// auth.js sets req.userId from the verified JWT, and req.user from
// user.toObject() — which has `_id`, NOT the Mongoose `.id` virtual
// (virtuals are off by default in toObject()), so the previous
// `req.user?.id` key was always undefined and every authed limiter
// silently fell back to the forgeable IP key. Keying by req.userId
// (with req.user._id as fallback) is what makes the demo limiter
// (5 AI requests/hour) actually per demo account.
const getKey = (req) => {
  return ipKeyGenerator(req.ip || 'unknown');
};

const getAuthedKey = (req) => {
  const userId = req.userId || req.user?._id;
  if (userId) return `user:${String(userId)}`;
  return getKey(req);
};

// ─── TIER 1: Global limiter ───────────────────────────────────────────────
// Applies to ALL routes - very generous limit
// 1000 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: getKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Health checks and session metadata are public and should not require auth.
    return ['/', '/health', '/healthz', '/api/health', '/api/auth/me'].includes(req.path);
  },
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
});

// ─── TIER 2: Login limiter ────────────────────────────────────────────────
// ONLY counts failed attempts (skipSuccessfulRequests: true)
// 30 FAILED attempts per hour per IP before blocking
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: getKey,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many failed login attempts. Please try again in 1 hour.',
  },
});

// ─── TIER 3: AI limiter (strict - no personal key) ───────────────────────
// 20 AI requests per hour for users without their own API key
const aiLimiterStrict = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: getAuthedKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AI request limit reached. Add your OpenRouter API key in Settings to remove limits.',
    addKeyPrompt: true,
  },
});

// ─── TIER 4: AI limiter (relaxed - has personal key) ─────────────────────
// 500 AI requests per hour for users with their own API key
const aiLimiterRelaxed = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  keyGenerator: getAuthedKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'You have reached 500 AI requests per hour.',
  },
});

// ─── TIER 5: Demo account limiter ────────────────────────────────────────
// 5 AI requests per hour for demo@mentorai.app
const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: getAuthedKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demo account AI limit reached. Register free to get more requests.',
    isDemo: true,
  },
});

// ─── SMART AI LIMITER ─────────────────────────────────────────────────────
// Picks the right limiter based on user type
const dynamicAiLimiter = (req, res, next) => {
  if (req.user?.isDemo) {
    return demoLimiter(req, res, next);
  }
  if (req.user?.openrouterApiKey) {
    return aiLimiterRelaxed(req, res, next);
  }
  return aiLimiterStrict(req, res, next);
};

// ─── RATE LIMIT HEADER HELPER ─────────────────────────────────────────────
const rateLimitInfoMiddleware = (req, res, next) => {
  res.setRateLimitHeaders = () => {
    try {
      const rl = req.rateLimit;
      if (!rl) return;
      if (rl.limit != null) res.setHeader('X-RateLimit-Limit', String(rl.limit));
      if (rl.remaining != null) res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
      if (rl.resetTime) {
        const ts = new Date(rl.resetTime).getTime();
        if (!Number.isNaN(ts)) res.setHeader('X-RateLimit-Reset', String(Math.floor(ts / 1000)));
      }
    } catch (e) {
      // non-fatal
    }
  };
  next();
};

module.exports = {
  globalLimiter,
  loginLimiter,
  aiLimiterStrict,
  aiLimiterRelaxed,
  demoLimiter,
  dynamicAiLimiter,
  rateLimitInfoMiddleware,
};
