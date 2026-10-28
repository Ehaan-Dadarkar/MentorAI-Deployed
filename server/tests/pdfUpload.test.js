// PDF import bounds (slice 38, AI/data M12): uploads now go to disk
// instead of multer memory storage, the size cap is 15 MB (was 50 MB),
// PDFs over 200 pages are rejected before any AI call, and a PDF with
// no extractable text gets the scanned/image-only message instead of
// the generic extraction failure. The temp file is removed when the
// response finishes (covered by the throwaway harness, not here: the
// route's multer middleware is not exported on its own).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const router = require("../routes/upload");
const { validateParsedPdf, pdfLimits } = router;

const routeSource = fs.readFileSync(
  path.join(__dirname, "..", "routes", "upload.js"),
  "utf8",
);

test("limits are 15 MB and 200 pages", () => {
  assert.equal(pdfLimits.maxFileSizeBytes, 15 * 1024 * 1024);
  assert.equal(pdfLimits.maxPages, 200);
});

test("a valid parse passes validation", () => {
  assert.equal(
    validateParsedPdf({ text: "Photosynthesis notes, ".repeat(10), numPages: 12 }),
    null,
  );
});

test("a PDF over the page cap is rejected before any AI call", () => {
  assert.equal(
    validateParsedPdf({ text: "Photosynthesis notes, ".repeat(10), numPages: 201 }),
    "PDF exceeds the 200-page limit",
  );
  assert.equal(
    validateParsedPdf({ text: "Photosynthesis notes, ".repeat(10), numPages: 200 }),
    null,
  );
});

test("empty or near-empty text gets the scanned-PDF message", () => {
  assert.match(
    validateParsedPdf({ text: "", numPages: 3 }),
    /scanned or image-only PDF/,
  );
  assert.match(
    validateParsedPdf({ text: "  \n  ", numPages: 1 }),
    /scanned or image-only PDF/,
  );
  assert.match(
    validateParsedPdf({ text: "too short", numPages: 1 }),
    /scanned or image-only PDF/,
  );
});

test("a missing parse result is a parse failure, not a validation pass", () => {
  assert.equal(validateParsedPdf(null), "Failed to parse PDF file");
});

test("the route uses disk storage, not memory storage", () => {
  assert.match(routeSource, /multer\.diskStorage/);
  assert.doesNotMatch(routeSource, /multer\.memoryStorage/);
  assert.match(routeSource, /os\.tmpdir\(\)/);
});

test("the route reads the file from disk and cleans it up on finish", () => {
  assert.match(routeSource, /fs\.promises\.readFile\(req\.file\.path\)/);
  assert.doesNotMatch(routeSource, /req\.file\.buffer/);
  assert.match(routeSource, /res\.on\("finish"/);
  assert.match(routeSource, /fs\.unlink\(uploadedPath/);
});

test("the size-limit message names the new 15 MB cap", () => {
  assert.match(routeSource, /PDF file size must be 15MB or less/);
  assert.doesNotMatch(routeSource, /50MB or less/);
});
