const { randomUUID } = require("crypto");

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "cookie",
  "openrouter_api_key",
  "jwt_secret",
]);

function maskSensitive(value, depth = 0) {
  if (value == null) {
    return value;
  }

  if (depth > 3) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => maskSensitive(item, depth + 1));
  }

  if (typeof value === "object") {
    const safe = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
        safe[key] = "[Redacted]";
      } else {
        safe[key] = maskSensitive(entry, depth + 1);
      }
    }
    return safe;
  }

  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}...[Truncated]`;
  }

  return value;
}

function log(level, message, metadata = {}) {
  const line = `[${new Date().toISOString()}] ${message}`;
  const payload = Object.keys(metadata).length
    ? JSON.stringify(metadata)
    : "";

  if (level === "error") {
    console.error(line, payload);
    return;
  }

  if (level === "warn") {
    console.warn(line, payload);
    return;
  }

  console.log(line, payload);
}

function requestLogger(req, res, next) {
  if (!req.originalUrl.startsWith("/api")) {
    return next();
  }

  const requestId = req.headers["x-request-id"] || randomUUID();
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    log(level, `API ${req.method} ${req.originalUrl} ${res.statusCode}`, {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userId: req.userId || null,
      query: maskSensitive(req.query),
      body: req.method === "GET" ? undefined : maskSensitive(req.body),
      userAgent: req.headers["user-agent"],
    });
  });

  next();
}

function errorLogger(err, req, _res, next) {
  const status = err.status || 500;
  log("error", `API ERROR ${req.method} ${req.originalUrl}`, {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl,
    statusCode: status,
    message: err.message,
    stack: err.stack,
  });

  next(err);
}

module.exports = {
  requestLogger,
  errorLogger,
};
