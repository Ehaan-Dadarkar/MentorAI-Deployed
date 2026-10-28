// JWT signing and verification, single place (Backend M8, minor m20).
//
// Every token carries the user's tokenVersion, so a logout-everywhere
// or password change invalidates all previously issued tokens even
// though their signatures and expiry are still valid: the auth
// middleware rejects any token whose version no longer matches the
// user's row. Tokens issued before tokenVersion existed carry no
// version claim and read as 0, matching a user that has never bumped.
//
// The algorithm is pinned to HS256 on both sign and verify, so a token
// minted under any other algorithm (including "none") is rejected.
// The secret is read from the environment on every call, never cached
// and never logged; a missing or short secret throws instead of
// silently signing under a weak key. server.js calls assertJwtSecret
// at boot so a misconfigured deploy fails fast instead of serving
// auth under a bad secret.
const jwt = require("jsonwebtoken");

const MIN_JWT_SECRET_LENGTH = 32;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long");
  }
  return secret;
}

function assertJwtSecret() {
  getJwtSecret();
}

function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ userId, tokenVersion }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
}

module.exports = {
  MIN_JWT_SECRET_LENGTH,
  getJwtSecret,
  assertJwtSecret,
  signToken,
  verifyToken,
};
