// Notes search: escaped $regex + trash filter preserved (Backend M9).
// The old code assigned filter.$or for the search, discarding the
// deleted/trash filter, so a search resurfaced trashed notes; and it
// fed the raw search string into $regex, so a term was a live regular
// expression (ReDoS, and ".*" matching everything).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const router = require("../routes/notes");
const { escapeRegExp, buildNotesListFilter } = router;

test("escapeRegExp escapes every regex metacharacter", () => {
  const meta = ".*+?^${}()|[]\\";
  const escaped = escapeRegExp(meta);
  assert.equal(escaped.length, meta.length * 2);
  const re = new RegExp(escaped);
  assert.equal(re.test(meta), true);
  assert.equal(re.test("zzzzzzzzzzzzzz"), false);
});

test("a pathological pattern is neutralised, not left live", () => {
  const escaped = escapeRegExp("(a+)+$");
  assert.equal(escaped, "\\(a\\+\\)\\+\\$");
  assert.equal(new RegExp(escaped).test("(a+)+$"), true);
  assert.equal(new RegExp(escaped).test("aaaaaa"), false);
});

test("search is ANDed with the non-deleted filter, not overwriting it", () => {
  const filter = buildNotesListFilter({
    userId: "u1",
    deletedFlag: "false",
    search: "cell.*",
  });
  assert.equal("$or" in filter, false);
  assert.equal(filter.$and.length, 2);
  assert.deepEqual(filter.$and[0], {
    $or: [
      { isDeleted: false },
      { isDeleted: { $exists: false }, deleted: false },
      { isDeleted: { $exists: false }, deleted: { $exists: false } },
    ],
  });
  assert.deepEqual(filter.$and[1], {
    $or: [
      { title: { $regex: "cell\\.\\*", $options: "i" } },
      { content: { $regex: "cell\\.\\*", $options: "i" } },
      { tags: { $regex: "cell\\.\\*", $options: "i" } },
    ],
  });
});

test("search in the trash view ANDs with the deleted filter", () => {
  const filter = buildNotesListFilter({
    userId: "u1",
    deletedFlag: "true",
    search: "x",
  });
  assert.equal(filter.$and.length, 2);
  assert.deepEqual(filter.$and[0], {
    $or: [
      { isDeleted: true },
      { isDeleted: { $exists: false }, deleted: true },
    ],
  });
  assert.equal(filter.$and[1].$or[0].title.$regex, "x");
});

test("no search keeps the old top-level deleted filter and subject", () => {
  const filter = buildNotesListFilter({
    userId: "u1",
    deletedFlag: "false",
    subject: "Biology",
  });
  assert.equal("$and" in filter, false);
  assert.equal(filter.subject, "Biology");
  assert.equal(filter.$or.length, 3);
});

test("route text: no raw search regex, no $or overwrite, query timed out", () => {
  const text = fs.readFileSync(
    path.join(__dirname, "../routes/notes.js"),
    "utf8",
  );
  assert.equal(text.includes("$regex: search"), false);
  assert.equal(text.includes("filter.$or ="), false);
  assert.equal(text.includes(".maxTimeMS(5000)"), true);
});
