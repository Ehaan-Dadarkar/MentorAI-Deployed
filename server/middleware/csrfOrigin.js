// CSRF origin check (Backend M2, slice 41): the audit's "at minimum"
// fix. CORS alone does not stop CSRF — a cross-site form POST or
// fetch carries the victim's cookies regardless of CORS, and the
// auth cookie is sameSite: "none" in production (Vercel -> Render
// requires it), so the browser's own CSRF defence is off. This
// middleware therefore checks, on every state-changing request,
// that the request actually came from an allowlisted frontend
// origin: the Origin header when present, else the Referer
// header's origin. A modern browser always sends Origin on a
// POST, so an attacker's page can never pass this check, and a
// forged Origin of "null" (sandboxed iframe) fails the exact
// match. Requests with neither header (curl, server-to-server
// clients, tests) pass through, exactly as the CORS middleware
// already treats no-origin requests — a page in a victim's
// browser cannot produce a headerless POST, so that passthrough
// does not reopen the browser attack. A double-submit CSRF token
// remains a follow-up for defence in depth (it would also cover
// a compromised allowlisted origin), but it is not needed to
// close the cross-site attack this middleware blocks.
const { isAllowedOrigin } = require("./cors");

const STATE_CHANGING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function csrfOriginCheck(req, res, next) {
  if (!STATE_CHANGING_METHODS.includes(req.method)) return next();
  const origin = req.get("Origin");
  if (origin) {
    if (isAllowedOrigin(origin)) return next();
    return res.status(403).json({ message: "Forbidden" });
  }
  const referer = req.get("Referer");
  if (referer) {
    let refererOrigin;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (isAllowedOrigin(refererOrigin)) return next();
    return res.status(403).json({ message: "Forbidden" });
  }
  // Neither header: a non-browser client. Pass through, matching
  // the CORS middleware's no-origin convention.
  return next();
}

module.exports = { csrfOriginCheck, STATE_CHANGING_METHODS };
