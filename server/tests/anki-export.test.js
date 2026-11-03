// Anki .apkg export (slice: Anki export): GET /api/flashcards/export/anki
// returns a real .apkg zip (collection.anki2 SQLite + media JSON) built
// from the user's deck cards. No database is connected here: auth's User
// lookup plus the Deck/Flashcard queries are stubbed; the zip is opened
// with jszip and the SQLite with sql.js to assert real structure.
// Fake cards only, in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const initSqlJs = require("sql.js");
const JSZip = require("jszip");

const User = require("../models/User");
const Deck = require("../models/Deck");
const Flashcard = require("../models/Flashcard");
const flashcardsRouter = require("../routes/flashcards");
const { buildApkg } = require("../services/ankiExport");

const JWT_SECRET = "anki-export-test-secret-at-least-32-chars";
const USER_ID = "user-1";
const DECK_ID = "507f1f77bcf86cd799439011";

function stubAuthUser(t, userDoc) {
  const original = User.findById;
  User.findById = () => ({
    select: async () => ({ toObject: () => userDoc }),
  });
  t.after(() => {
    User.findById = original;
  });
}

function stubDeckCards(t, { deckDoc, cards, seen }) {
  const origFindOne = Deck.findOne;
  const origFind = Flashcard.find;
  Deck.findOne = (query) => {
    seen.deckQuery = query;
    return { select: async () => deckDoc };
  };
  Flashcard.find = (query) => {
    seen.cardQuery = query;
    return { select: () => ({ sort: async () => cards }) };
  };
  t.after(() => {
    Deck.findOne = origFindOne;
    Flashcard.find = origFind;
  });
}

async function startApp(t) {
  const app = express();
  app.use(cookieParser());
  app.use("/api/flashcards", flashcardsRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => server.close());
  return server.address().port;
}

function getExport(port, token, query) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "GET",
        host: "127.0.0.1",
        port,
        path: `/api/flashcards/export/anki${query}`,
        headers: { Cookie: `token=${token}` },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function runCase(t, { userDoc, deckDoc, cards, query }) {
  stubAuthUser(t, userDoc);
  const seen = {};
  stubDeckCards(t, { deckDoc, cards, seen });
  const port = await startApp(t);
  const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);
  const result = await getExport(port, token, query);
  result.seen = seen;
  return result;
}

const keylessUser = { _id: USER_ID, email: "user@example.com", isDemo: false };
const deckDoc = { _id: DECK_ID, name: "Biology 101" };
const cardDocs = [
  { question: "What is 2+2?", answer: "4" },
  { question: "Capital of France?", answer: "Paris" },
];

async function openCollection(apkgBuffer) {
  const zip = await JSZip.loadAsync(apkgBuffer);
  assert.ok(zip.file("collection.anki2"), "zip has collection.anki2");
  assert.ok(zip.file("media"), "zip has media");
  const media = await zip.file("media").async("string");
  assert.equal(media, "{}", "media is an empty JSON map");
  const sqliteBytes = await zip.file("collection.anki2").async("uint8array");
  const SQL = await initSqlJs();
  return new SQL.Database(sqliteBytes);
}

function scalar(db, sql) {
  const res = db.exec(sql);
  assert.ok(res.length > 0, `query returned rows: ${sql}`);
  return res[0].values[0][0];
}

test("route mounts after auth with a deckId query param", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "routes", "flashcards.js"), "utf8");
  assert.match(src, /router\.get\("\/export\/anki", auth,/);
});

test("export returns a valid .apkg download with the deck's cards", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, headers, body, seen } = await runCase(t, {
    userDoc: keylessUser,
    deckDoc,
    cards: cardDocs,
    query: `?deckId=${DECK_ID}`,
  });
  assert.equal(status, 200);
  assert.equal(headers["content-type"], "application/octet-stream");
  assert.match(
    headers["content-disposition"] || "",
    /attachment; filename="Biology 101-anki\.apkg"/,
  );
  // PK zip magic.
  assert.equal(body[0], 0x50);
  assert.equal(body[1], 0x4b);

  // Queries are scoped to the authenticated user.
  assert.equal(seen.deckQuery.userId, USER_ID);
  assert.equal(seen.cardQuery.userId, USER_ID);
  assert.equal(String(seen.cardQuery.deckId), DECK_ID);

  const db = await openCollection(body);
  try {
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      [0].values.map((r) => r[0]);
    for (const needed of ["col", "notes", "cards", "revlog", "graves"]) {
      assert.ok(tables.includes(needed), `table ${needed} exists`);
    }
    assert.equal(scalar(db, "SELECT COUNT(*) FROM notes"), 2);
    assert.equal(scalar(db, "SELECT COUNT(*) FROM cards"), 2);

    const flds = db.exec("SELECT flds FROM notes")[0].values.map((r) => r[0]);
    assert.ok(
      flds.some((f) => f.includes("What is 2+2?") && f.includes("4")),
      "note 1 front/back present",
    );
    assert.ok(
      flds.some((f) => f.includes("Capital of France?") && f.includes("Paris")),
      "note 2 front/back present",
    );
    // Fields are joined with \x1f.
    assert.ok(flds.every((f) => f.includes("\x1f")), "fields joined by \\x1f");

    const decks = JSON.parse(scalar(db, "SELECT decks FROM col"));
    const deckIds = Object.keys(decks);
    assert.equal(deckIds.length, 1);
    assert.equal(decks[deckIds[0]].name, "Biology 101");

    const models = JSON.parse(scalar(db, "SELECT models FROM col"));
    const modelIds = Object.keys(models);
    assert.equal(modelIds.length, 1);
    const fieldNames = models[modelIds[0]].flds.map((f) => f.name);
    assert.deepEqual(fieldNames, ["Front", "Back"]);

    // Every card points at a real note in the exported deck.
    assert.equal(scalar(db, "SELECT COUNT(*) FROM cards WHERE nid NOT IN (SELECT id FROM notes)"), 0);
    assert.equal(
      scalar(db, `SELECT COUNT(*) FROM cards WHERE did != ${deckIds[0]}`),
      0,
    );
  } finally {
    db.close();
  }
});

test("another user's deck answers 404", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    deckDoc: null,
    cards: cardDocs,
    query: `?deckId=${DECK_ID}`,
  });
  assert.equal(status, 404);
  assert.equal(JSON.parse(body.toString()).error, "Deck not found");
});

test("deck with no exportable cards answers 404", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status, body } = await runCase(t, {
    userDoc: keylessUser,
    deckDoc,
    cards: [],
    query: `?deckId=${DECK_ID}`,
  });
  assert.equal(status, 404);
  assert.equal(JSON.parse(body.toString()).error, "Deck has no cards to export");
});

test("invalid deckId answers 404 without hitting the database", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  let dbHit = false;
  stubAuthUser(t, keylessUser);
  const origFindOne = Deck.findOne;
  Deck.findOne = () => {
    dbHit = true;
    return { select: async () => deckDoc };
  };
  t.after(() => {
    Deck.findOne = origFindOne;
  });
  const port = await startApp(t);
  const token = jwt.sign({ userId: USER_ID }, JWT_SECRET);
  const { status } = await getExport(port, token, "?deckId=not-an-objectid");
  assert.equal(status, 404);
  assert.equal(dbHit, false);
});

test("missing deckId answers 404", async (t) => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { status } = await runCase(t, {
    userDoc: keylessUser,
    deckDoc,
    cards: cardDocs,
    query: "",
  });
  assert.equal(status, 404);
});

test("buildApkg throws on empty input instead of producing an empty deck", async () => {
  await assert.rejects(() => buildApkg("Empty", []), /No cards to export/);
  await assert.rejects(
    () => buildApkg("Blank", [{ front: "  ", back: "" }]),
    /No cards to export/,
  );
});
