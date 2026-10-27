// Tutor session snapshot cap (AI/data M7, slice 16).
//
// The snapshot stored on TutorSessionSummary is a resume aid, not an
// archive: the client restores a session from it, and the provider
// prompt only ever uses the last 10 messages. Before this slice the
// snapshot had no bound of its own — it was whatever the request
// carried, so a long conversation could store up to the request cap
// (50 messages x 12,000 chars, ~600 KB) in every session document,
// and that whole snapshot came back in every GET /sessions list
// response. The document limit it was heading for is MongoDB's
// 16 MB, and a save that hit it failed silently (see tutor.js).
//
// This builder is the snapshot's own bound, independent of request
// validation, so a future validation change cannot re-open it:
// at most 50 messages, each at most 12,000 chars (the chatSchema
// content cap), at most 3 follow-ups per message, and at most
// 120,000 content chars in total — roughly 100x under the 16 MB
// document limit even with the rest of the document. When the
// budget is exceeded the oldest messages are dropped and the
// newest are kept, so a resumed session always ends with the
// latest exchange. messageCount on the document is deliberately
// left as the conversation length: after capping, the snapshot
// may be shorter than the conversation, and that is the point.
const MAX_SNAPSHOT_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 12000;
const MAX_SNAPSHOT_CHARS = 120000;
const MAX_FOLLOW_UPS = 3;

function sanitizeMessage(message) {
  if (!message || (message.role !== "user" && message.role !== "assistant")) {
    return null;
  }
  const content = typeof message.content === "string" ? message.content : "";
  if (!content.trim()) return null;
  const out = {
    role: message.role,
    content: content.slice(0, MAX_MESSAGE_CHARS),
  };
  if (Array.isArray(message.followUps)) {
    const followUps = message.followUps
      .filter((item) => typeof item === "string" && item.trim())
      .slice(0, MAX_FOLLOW_UPS);
    if (followUps.length > 0) out.followUps = followUps;
  }
  if (message.createdAt !== undefined && message.createdAt !== null) {
    const createdAt =
      message.createdAt instanceof Date
        ? message.createdAt
        : new Date(message.createdAt);
    if (!Number.isNaN(createdAt.getTime())) out.createdAt = createdAt;
  }
  return out;
}

function buildMessagesSnapshot(history, assistantMessage) {
  const sanitized = [...(Array.isArray(history) ? history : []), assistantMessage]
    .map(sanitizeMessage)
    .filter(Boolean)
    .slice(-MAX_SNAPSHOT_MESSAGES);

  // Trim from the oldest end until the total fits. The newest
  // message is always kept, even if it alone exceeded the budget
  // (it cannot: per-message chars are capped well under it).
  let totalChars = 0;
  let start = sanitized.length;
  for (let i = sanitized.length - 1; i >= 0; i -= 1) {
    if (i < sanitized.length - 1 && totalChars + sanitized[i].content.length > MAX_SNAPSHOT_CHARS) {
      break;
    }
    totalChars += sanitized[i].content.length;
    start = i;
  }
  return sanitized.slice(start);
}

module.exports = {
  buildMessagesSnapshot,
  MAX_SNAPSHOT_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_SNAPSHOT_CHARS,
  MAX_FOLLOW_UPS,
};
