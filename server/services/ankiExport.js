// Anki .apkg export (slice: Anki export).
//
// An .apkg is a zip containing:
//   - collection.anki2 — a SQLite database with Anki's collection schema
//   - media — a JSON map of media file indexes to filenames ("{}" when the
//     export carries no media, as here)
//
// The SQLite side is built with sql.js (pure-JS/WASM SQLite, no native
// modules) and zipped with jszip. The schema below is the minimal valid
// subset Anki Desktop expects on import: one Basic note type (Front/Back),
// one deck, one note + one card per flashcard. Scheduling columns are
// zeroed so every card imports as new.
//
// This module is pure: buildApkg(deckName, cards) -> Promise<Buffer>.
// cards: [{ front, back }]. Throws on empty input.
const crypto = require("crypto");
const initSqlJs = require("sql.js");
const JSZip = require("jszip");

const GUID_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#%&()*+,-./:;=?@[]^_`{|}~";

function makeGuid() {
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += GUID_CHARS[crypto.randomInt(GUID_CHARS.length)];
  }
  return out;
}

// Anki's field checksum: first 8 hex digits of sha1(stripped front) as int.
function fieldChecksum(text) {
  const hex = crypto.createHash("sha1").update(text, "utf8").digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

// Fields are HTML in Anki: escape markup and turn newlines into <br>.
function toHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, "<br>");
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]*>/g, "");
}

const SCHEMA = `
CREATE TABLE col (
  id integer primary key,
  crt integer not null,
  mod integer not null,
  scm integer not null,
  ver integer not null,
  dty integer not null,
  usn integer not null,
  ls integer not null,
  conf text not null,
  models text not null,
  decks text not null,
  dconf text not null,
  tags text not null
);
CREATE TABLE notes (
  id integer primary key,
  guid text not null,
  mid integer not null,
  mod integer not null,
  usn integer not null,
  tags text not null,
  flds text not null,
  sfld text not null,
  csum integer not null,
  flags integer not null,
  data text not null
);
CREATE TABLE cards (
  id integer primary key,
  nid integer not null,
  did integer not null,
  ord integer not null,
  mod integer not null,
  usn integer not null,
  type integer not null,
  queue integer not null,
  due integer not null,
  ivl integer not null,
  factor integer not null,
  reps integer not null,
  lapses integer not null,
  left integer not null,
  odue integer not null,
  odid integer not null,
  flags integer not null,
  data text not null
);
CREATE TABLE revlog (
  id integer primary key,
  cid integer not null,
  usn integer not null,
  ease integer not null,
  ivl integer not null,
  lastIvl integer not null,
  factor integer not null,
  time integer not null,
  type integer not null
);
CREATE TABLE graves (
  usn integer not null,
  oid integer not null,
  type integer not null
);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_revlog_cid on revlog (cid);
`;

function buildModelsJson(mid, did, nowMs) {
  const model = {
    id: mid,
    name: "Basic",
    type: 0,
    mod: Math.floor(nowMs / 1000),
    usn: 0,
    sortf: 0,
    did,
    tmpls: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: "{{Front}}",
        afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        did: null,
        bqfmt: "",
        bafmt: "",
      },
    ],
    flds: [
      { name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
      { name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
    ],
    css: ".card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n",
    latexPre:
      "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}",
    latexsvg: false,
    req: [[0, "all", [0]]],
  };
  return JSON.stringify({ [String(mid)]: model });
}

function buildDecksJson(did, deckName, nowMs) {
  const deck = {
    id: did,
    name: deckName,
    desc: "",
    mod: Math.floor(nowMs / 1000),
    usn: 0,
    collapsed: false,
    browserCollapsed: false,
    dyn: 0,
    extendNew: 10,
    extendRev: 50,
    conf: 1,
    newToday: [0, 0],
    revToday: [0, 0],
    lrnToday: [0, 0],
    timeToday: [0, 0],
  };
  return JSON.stringify({ [String(did)]: deck });
}

function buildConfJson(did, mid) {
  return JSON.stringify({
    nextPos: 1,
    estTimes: true,
    activeDecks: [did],
    sortType: "noteFld",
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: did,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: mid,
    collapseTime: 1200,
  });
}

function buildDconfJson() {
  return JSON.stringify({
    1: {
      id: 1,
      name: "Default",
      replayq: true,
      lapse: {
        delays: [10],
        mult: 0,
        minInt: 1,
        leechFails: 8,
        leechAction: 0,
      },
      rev: { perDay: 200, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3, bury: true, minSpace: 1 },
      new: {
        perDay: 20,
        delays: [1, 10],
        separate: true,
        ints: [1, 4, 7],
        initialFactor: 2500,
        bury: true,
        order: 1,
      },
      maxTaken: 60,
      autoplay: true,
      timer: 0,
    },
  });
}

async function buildApkg(deckName, cards) {
  const list = (cards || []).filter(
    (c) => c && String(c.front || "").trim() && String(c.back || "").trim(),
  );
  if (list.length === 0) {
    throw new Error("No cards to export");
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    // Millisecond timestamps are unique as long as we increment per row.
    let clock = nowMs;
    const nextId = () => clock++;
    const did = nextId();
    const mid = nextId();

    const insertNote = db.prepare(
      "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, 0, '', ?, ?, ?, 0, '')",
    );
    const insertCard = db.prepare(
      "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')",
    );
    try {
      list.forEach((card, index) => {
        const front = toHtml(card.front);
        const back = toHtml(card.back);
        const noteId = nextId();
        const sfld = stripHtml(card.front).trim().slice(0, 255) || "note";
        insertNote.run([noteId, makeGuid(), mid, nowSec, `${front}\x1f${back}`, sfld, fieldChecksum(sfld)]);
        insertCard.run([nextId(), noteId, did, nowSec, index + 1]);
      });
    } finally {
      insertNote.free();
      insertCard.free();
    }

    db.run("INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')", [
      nowSec,
      nowMs,
      nowMs,
      buildConfJson(did, mid),
      buildModelsJson(mid, did, nowMs),
      buildDecksJson(did, String(deckName || "Deck"), nowMs),
      buildDconfJson(),
    ]);

    const sqliteBytes = db.export();

    const zip = new JSZip();
    zip.file("collection.anki2", sqliteBytes);
    zip.file("media", "{}");
    return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  } finally {
    db.close();
  }
}

module.exports = { buildApkg };
