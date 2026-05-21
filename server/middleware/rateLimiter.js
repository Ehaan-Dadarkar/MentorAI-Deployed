const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// ─── KEY GENERATOR ────────────────────────────────────────────────────────
// Uses real IP from proxy headers, falls back to req.ip
const getKey = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = forwarded
    ? forwarded.split(',')[0].trim()
    : req.headers['x-real-ip'] || req.ip || 'unknown';
  return ipKeyGenerator(rawIp);
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
    // Never rate limit health checks or auth/me
    return req.path === '/api/auth/me' || req.path === '/api/health';
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
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    if (req.user?.id) return req.user.id;
    return getKey(req);
  },
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
  keyGenerator: (req) => {
    if (req.user?.id) return req.user.id;
    return getKey(req);
  },
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
  keyGenerator: (req) => {
    if (req.user?.id) return req.user.id;
    return getKey(req);
  },
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
