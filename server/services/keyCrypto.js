// User OpenRouter keys at rest (AI/data M8). The User document used to
// store the key in clear text: `select: false` only stops accidental
// API exposure, it does nothing against a database breach. Keys are
// now encrypted with AES-256-GCM when written and decrypted only where
// the key is actually needed (the access gate, and the masked display
// in settings). Every other read (has-key booleans, the rate-limiter
// truthiness check) works on the stored value unchanged, encrypted
// or not, because an encrypted value is still a non-empty string.
//
// Key sourcing: KEY_ENCRYPTION_KEY from the environment, either 64
// hex characters or base64 encoding exactly 32 bytes. It is read on
// every call, never cached at module load, so tests and key rotation
// do not need a process restart to take effect, and it is never
// logged or stored.
//
// Activation is deliberately gradual, not fail-closed, because this
// programme cannot set the production environment (no Render env
// changes without Ehaan's word):
//   - No key configured: encryptKey returns the value unchanged and
//     decryptKey returns it unchanged. Behaviour is exactly the old
//     plaintext behaviour, and nothing breaks on deploy.
//   - Key configured: new writes are encrypted; reads decrypt.
//   - Legacy plaintext rows (written before the key was set) keep
//     working: a value without the `enc:v1:` prefix is returned
//     as-is, and is re-encrypted the next time the user re-saves
//     their key. They are NOT silently migrated on read, so a read
//     never writes to the database as a side effect.
//   - A value with the prefix that cannot be decrypted (key missing
//     after rotation, or tampered ciphertext) decrypts to null, never
//     to the ciphertext itself: handing ciphertext to the provider
//     as if it were a key would only waste a provider call, and
//     returning it anywhere else would leak the stored blob. Callers
//     treat null as "no usable key" (402 / maskedKey null).
//
// Format: enc:v1:<iv hex>:<authTag hex>:<ciphertext hex>. The IV is
// random per encryption, so two encryptions of the same key differ.

const crypto = require("crypto");

const PREFIX = "enc:v1:";

function getEncryptionKey() {
  const raw = process.env.KEY_ENCRYPTION_KEY;
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    return null;
  }
  return null;
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptKey(value) {
  if (!value) return value;
  const key = getEncryptionKey();
  if (!key) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptKey(value) {
  if (!value) return value;
  if (!isEncrypted(value)) return value;
  const key = getEncryptionKey();
  if (!key) return null;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, ciphertextHex] = parts;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

module.exports = { PREFIX, getEncryptionKey, isEncrypted, encryptKey, decryptKey };
