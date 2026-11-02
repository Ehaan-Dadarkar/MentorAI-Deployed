// C2 regression: buildNoteCentricGraph called requireOpenRouterAccess(req, res)
// with req/res out of scope -> ReferenceError: req is not defined, a 500 on
// every knowledge-graph load for any user with notes. The fix threads req/res
// through the call. This test drives GET / with stubbed models and a stubbed
// credit gate + AI call and asserts the handler completes instead of failing
// with a ReferenceError. No database is connected: all five models are
// stubbed per test, so this asserts the route's own wiring, not MongoDB.
const test = require("node:test");
const assert = require("node:assert/strict");

const Note = require("../models/Note");
const Quiz = require("../models/Quiz");
const VoiceSession = require("../models/VoiceSession");
const Deck = require("../models/Deck");
const Flashcard = require("../models/Flashcard");

// The route destructures requireOpenRouterAccess/refundCreditSpend and
// callOpenRouter at load time, so seed require.cache before requiring it.
function seedStubs() {
  const openRouterAccessPath = require.resolve("../services/openrouterAccess");
  const aiPath = require.resolve("../services/ai");

  const Module = require("module");
  const seed = (resolvedPath, exportsObj) => {
    const m = new Module(resolvedPath, module);
    m.filename = resolvedPath;
    m.paths = Module._nodeModulePaths(require("path").dirname(resolvedPath));
    m.exports = exportsObj;
    require.cache[resolvedPath] = m;
  };

  seed(openRouterAccessPath, {
    requireOpenRouterAccess: async () => ({ apiKey: "fake-key" }),
    refundCreditSpend: async () => {},
  });
  seed(aiPath, {
    callOpenRouter: async () => '{"edges": []}',
  });
}
seedStubs();

const router = require("../routes/knowledge-graph");

// The find().sort().limit().select().lean() chain the route uses.
function chainable(t, docs) {
  const q = {
    sort: () => q,
    limit: () => q,
    select: () => q,
    lean: async () => docs,
  };
  return q;
}

function stubModels(t, { notes }) {
  const originals = {
    Note: Note.find,
    Quiz: Quiz.find,
    VoiceSession: VoiceSession.find,
    Deck: Deck.find,
    Flashcard: Flashcard.find,
  };
  Note.find = () => chainable(t, notes);
  Quiz.find = () => chainable(t, []);
  VoiceSession.find = () => chainable(t, []);
  Deck.find = () => chainable(t, []);
  Flashcard.find = () => chainable(t, []);
  t.after(() => {
    Note.find = originals.Note;
    Quiz.find = originals.Quiz;
    VoiceSession.find = originals.VoiceSession;
    Deck.find = originals.Deck;
    Flashcard.find = originals.Flashcard;
  });
}

function getRootHandler() {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === "/" && l.route.methods.get,
  );
  assert.ok(layer, "GET / route not found");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test("GET / completes for a user with notes when the AI path engages (C2)", async (t) => {
  const notes = [
    {
      _id: "note1",
      title: "Maths",
      content: "algebra geometry trigonometry calculus",
      keyTerms: ["Algebra", "Geometry", "Trigonometry", "Calculus"],
      subject: "Maths",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  stubModels(t, { notes });

  const handler = getRootHandler();
  const req = { userId: "user1", user: { _id: "user1" }, query: { ai: "true" } };
  let body = null;
  const res = {
    json: (payload) => {
      body = payload;
      return res;
    },
  };
  let nextError = null;
  const next = (err) => {
    nextError = err || null;
  };

  await handler(req, res, next);

  assert.equal(nextError, null, `handler raised: ${nextError && nextError.message}`);
  assert.ok(body, "handler did not respond");
  assert.equal(body.success, true);
  assert.ok(body.nodes.length >= 4, "expected note + concept nodes");
  assert.equal(
    body.nodes.filter((n) => n.type === "concept").length,
    4,
    "AI path needs 4+ concept nodes to engage",
  );
});
