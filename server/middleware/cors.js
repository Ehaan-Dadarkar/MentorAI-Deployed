// CORS allowlist (AI/data M3, slice 4), extracted from server.js so
// it is importable and testable. Behaviour is unchanged: exact
// string matches only — no regex, so no `*.vercel.app` origin can
// ever pass — and requests without an Origin (non-browser clients)
// still pass through.
const cors = require("cors");

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.CLIENT_URL,
  "https://mentorai.vercel.app",
  "https://mentorai-prod.vercel.app",
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

const corsMiddleware = cors({
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

module.exports = { allowedOrigins, isAllowedOrigin, corsMiddleware };
