// Validation mass-assignment fix (Backend M3, M4, slice 39).
// validate() must assign Zod's parsed output, so unknown body keys
// (userId, deckId, $ operators, isDeleted) never reach a create or
// update, and the two audit spread sites must destructure allowlisted
// fields instead of spreading req.body.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const validate = require("../middleware/validate");

const createSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional().default(""),
  subject: z.string().optional().default("General"),
});

function runMiddleware(schema, body) {
  const req = { body };
  let nextCalled = false;
  let status = null;
  let payload = null;
  const res = {
    status(code) {
      status = code;
      return { json(value) { payload = value; } };
    },
  };
  const next = () => { nextCalled = true; };
  validate(schema)(req, res, next);
  return { req, nextCalled, status, payload };
}

test("parsed output replaces the body: unknown keys and $ operators are stripped", () => {
  const { req, nextCalled } = runMiddleware(createSchema, {
    title: "Cells",
    userId: "victim-id",
    isDeleted: true,
    $set: { userId: "victim-id" },
    isDemoNote: true,
  });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.body, { title: "Cells", content: "", subject: "General" });
  assert.ok(!("userId" in req.body));
  assert.ok(!("$set" in req.body));
  assert.ok(!("isDeleted" in req.body));
});

test("invalid body still gets a 400 with non-empty field details (Zod v4 issues)", () => {
  const { nextCalled, status, payload } = runMiddleware(createSchema, { title: "" });
  assert.equal(nextCalled, false);
  assert.equal(status, 400);
  assert.equal(payload.success, false);
  assert.ok(Array.isArray(payload.details) && payload.details.length > 0);
  assert.equal(payload.details[0].field, "title");
});

test("notes create/update no longer spread the raw body", () => {
  const text = fs.readFileSync(path.join(__dirname, "../routes/notes.js"), "utf8");
  assert.ok(!text.includes("...req.body"));
  assert.ok(text.includes("const { title, content, subject, tags, sourceType } = req.body;"));
  assert.ok(text.includes("{ $set: req.body }"));
  assert.ok(text.includes("runValidators: true"));
});

test("flashcard single-card create no longer spreads the raw body", () => {
  const text = fs.readFileSync(path.join(__dirname, "../routes/flashcards.js"), "utf8");
  assert.ok(!text.includes("...req.body"));
  assert.ok(text.includes("const { question, answer, difficulty } = req.body;"));
});
