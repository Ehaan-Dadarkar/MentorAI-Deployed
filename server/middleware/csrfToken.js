// Double-submit CSRF token (Backend M2 hardening, slice 46): the
// follow-up to slice 41's origin check. The origin check already
// closes the cross-site attack; this token adds defence in depth
// for the case where the Origin/Referer check is bypassed or the
// allowlisted origin is somehow abused by a third party that can
// forge a request but cannot read this site's responses.
//
// How it works: GET /api/auth/csrf-token issues a random token,
// sets it as a cookie, and returns the same value in JSON. The
// client stores the JSON value in memory and sends it back as the
// X-CSRF-Token header on every state-changing request. The server
// accepts only when header and cookie match (constant-time
// compare). A cross-site page cannot read the token endpoint's
// response (CORS allowlist) and cannot read the cookie
// (same-origin), so it cannot produce a matching header even
// though the victim's browser would send the cookies.
//
// The cookie is httpOnly: the client never reads document.cookie,
// it uses the JSON value, so the cookie value itself is not
// exposed to page JavaScript beyond the one fetch that issued it.
// The token is NOT bound to a session or a user: it is issued
// before login (login/register/demo-login are themselves
// state-changing, so they need a token too, and no session exists
// yet to bind one to). The client therefore fetches it lazily on
// the first mutation instead of at page load, which is what solves
// slice 45's bootstrap problem — no prefetch step before the
// first login can succeed, and no login flow change.
//
// Non-browser passthrough, matching slice 41's convention: a
// state-changing request that carries no Origin, no Referer, and
// no cookies at all passes through. A page in a victim's browser
// cannot produce such a request (a browser POST always sends
// Origin and the cookies), so this does not reopen the browser
// attack; it only keeps curl / server-to-server API use working.
// Any request that carries a browser signal (Origin, Referer, or
// any cookie — including the auth cookie without a token) is
// checked and rejected with 403 + code CSRF_TOKEN_INVALID when
// the header/cookie pair is missing or mismatched, so the client
// can refetch and retry exactly once.
const crypto = require("crypto");

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const STATE_CHANGING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

function csrfCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

// GET /api/auth/csrf-token handler: issues a fresh token, sets the
// cookie, and returns the same value for the client to send back.
function issueCsrfToken(_req, res) {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return res.json({ csrfToken: token });
}

function tokensEqual(headerToken, cookieToken) {
  if (typeof headerToken !== "string" || typeof cookieToken !== "string") {
    return false;
  }
  if (!headerToken || !cookieToken) return false;
  const headerBuffer = Buffer.from(headerToken);
  const cookieBuffer = Buffer.from(cookieToken);
  return (
    headerBuffer.length === cookieBuffer.length &&
    crypto.timingSafeEqual(headerBuffer, cookieBuffer)
  );
}

function csrfTokenCheck(req, res, next) {
  if (!STATE_CHANGING_METHODS.includes(req.method)) return next();
  const cookies = req.cookies || {};
  const hasBrowserSignal = Boolean(
    req.get("Origin") || req.get("Referer") || Object.keys(cookies).length > 0,
  );
  // No browser signal: a non-browser client. Pass through, matching
  // the slice-41 origin check's convention.
  if (!hasBrowserSignal) return next();
  if (!tokensEqual(req.get(CSRF_HEADER_NAME), cookies[CSRF_COOKIE_NAME])) {
    return res
      .status(403)
      .json({ message: "Forbidden", code: "CSRF_TOKEN_INVALID" });
  }
  return next();
}

module.exports = {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  STATE_CHANGING_METHODS,
  generateCsrfToken,
  issueCsrfToken,
  tokensEqual,
  csrfTokenCheck,
};
