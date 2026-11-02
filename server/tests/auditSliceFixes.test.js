// Regression tests for the audit slice H10 / M4 / M7 / M11 / M15 fixes
// (SECOND-AUDIT-2026-11-02). Follows the source-scan convention of
// pdfUpload.test.js: structural guarantees about the route sources.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readRoute = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "routes", name), "utf8");

// ── M15: SM-2 "mastered" threshold is >= 80 everywhere ──────────

test("M15: no mastery threshold uses $gt (strictly greater than 80)", () => {
  const src = readRoute("flashcards.js");
  assert.ok(!/\$gt:\s*80/.test(src), "found a $gt: 80 mastery threshold");
});

test("M15: every mastered-threshold site uses $gte with 80", () => {
  const src = readRoute("flashcards.js");
  // $gte: [..., 80] aggregation form and mastery: { $gte: 80 } query form
  const gteSites = src.match(/\$gte[^\n]*80/g) || [];
  assert.ok(
    gteSites.length >= 3,
    `expected >= 3 mastered-threshold sites at >= 80, found ${gteSites.length}`,
  );
  // The stats endpoint counts mastered cards with the same threshold
  assert.ok(
    src.includes("Flashcard.countDocuments({ userId, mastery: { $gte: 80 } })"),
    "stats mastered-card count is not at >= 80",
  );
});

// ── M7: translate prompt input is truncated ─────────────────────

test("M7: notes translate interpolates truncateAiInput(note.content), not raw content", () => {
  const src = readRoute("notes.js");
  assert.ok(
    src.includes("truncateAiInput(note.content)"),
    "translate prompt does not call truncateAiInput on note.content",
  );
});

test("M7: the local truncateAiInput caps at 12000 chars like ai.js", () => {
  const src = readRoute("notes.js");
  assert.ok(
    src.includes("const TRANSLATE_INPUT_MAX_CHARS = 12000;"),
    "TRANSLATE_INPUT_MAX_CHARS is not 12000",
  );
  assert.ok(
    /const truncateAiInput = \(text\) =>/.test(src),
    "truncateAiInput helper missing",
  );
});

// ── M4: PDF structuring discloses its truncation ─────────────────

test("M4: PDF structuring limits are named constants (3000 AI / 12000 fallback)", () => {
  const src = readRoute("upload.js");
  assert.ok(
    src.includes("const PDF_STRUCTURE_AI_CHAR_LIMIT = 3000;"),
    "AI structuring char limit constant missing",
  );
  assert.ok(
    src.includes("const PDF_STRUCTURE_FALLBACK_CHAR_LIMIT = 12_000;"),
    "fallback structuring char limit constant missing",
  );
  assert.ok(!src.includes("substring(0, 3000)"), "magic 3000 still present");
  assert.ok(!src.includes("slice(0, 12_000)"), "magic 12_000 still present");
});

test("M4: normalizeStructuredPayload reports which limit produced the structure", () => {
  const src = readRoute("upload.js");
  assert.ok(
    src.includes("structuredCharLimit"),
    "structuredCharLimit not tracked",
  );
});

test("M4: POST /upload/pdf responds with structuredFrom disclosure metadata", () => {
  const src = readRoute("upload.js");
  assert.ok(src.includes("structuredFrom: {"), "structuredFrom missing from response");
  assert.ok(src.includes("charLimit: structuredCharLimit"), "charLimit not disclosed");
  assert.ok(src.includes("totalChars: text.length"), "totalChars not disclosed");
  assert.ok(
    src.includes("truncated: text.length > structuredCharLimit"),
    "truncated flag not disclosed",
  );
});
