const express = require("express");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { summarizeContent, callOpenRouter } = require("../services/ai");
const { requireOpenRouterAccess, refundCreditSpend } = require("../services/openrouterAccess");
const { usageCallbackFor } = require("../services/usage");
const Note = require("../models/Note");

// M7: cap note content interpolated into AI prompts. Mirrors the
// truncateAiInput helper in server/services/ai.js (AI_INPUT_MAX_CHARS =
// 12000), kept local so this route does not depend on ai.js internals.
const TRANSLATE_INPUT_MAX_CHARS = 12000;
const truncateAiInput = (text) =>
  typeof text === "string" ? text.slice(0, TRANSLATE_INPUT_MAX_CHARS) : text;

const router = express.Router();

function buildDeletedQuery(deletedValue) {
  const isDeleted = deletedValue === "true";

  if (isDeleted) {
    return {
      $or: [{ isDeleted: true }, { isDeleted: { $exists: false }, deleted: true }],
    };
  }

  return {
    $or: [
      { isDeleted: false },
      { isDeleted: { $exists: false }, deleted: false },
      { isDeleted: { $exists: false }, deleted: { $exists: false } },
    ],
  };
}

// Escape a user search string before it reaches $regex (Backend M9):
// without this, a search term is a live regular expression, so a
// pathological pattern can burn CPU (ReDoS) and a term like ".*" can
// match everything.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build the notes-list filter. A search term is ANDed with the
// deleted/trash filter instead of overwriting its $or (Backend M9):
// the old code assigned filter.$or for the search, discarding the
// deleted filter, so a search resurfaced trashed notes.
function buildNotesListFilter({ userId, deletedFlag, subject, search }) {
  const deletedQuery = buildDeletedQuery(deletedFlag);
  const filter = { userId };
  if (subject) {
    filter.subject = subject;
  }
  if (search) {
    const escaped = escapeRegExp(search);
    filter.$and = [
      deletedQuery,
      {
        $or: [
          { title: { $regex: escaped, $options: "i" } },
          { content: { $regex: escaped, $options: "i" } },
          { tags: { $regex: escaped, $options: "i" } },
        ],
      },
    ];
  } else {
    Object.assign(filter, deletedQuery);
  }
  return filter;
}

router.escapeRegExp = escapeRegExp;
router.buildNotesListFilter = buildNotesListFilter;

// Snippet extraction (slice 159): ~600-char window around the first query
// term hit, so ranked results and tutor prompts show the relevant passage
// instead of the note's opening paragraph.
function extractSnippet(content, query, radius = 300) {
  const text = String(content || "");
  if (!text) return "";
  const lower = text.toLowerCase();
  const terms = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let idx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

// Strip Mongo $text operator syntax from a user query so quotes can't
// change the search semantics (they're phrase operators in $text).
function sanitizeTextQuery(q) {
  return String(q || "").replace(/["']/g, "").trim();
}

// Ranked passage retrieval over a user's notes (slice 159). Uses the
// note_text_search index (stemmed, weighted title > tags > content).
// Shared by GET /api/notes/search and the tutor's automatic context.
// Never throws for a bad query — returns [].
async function retrieveNotePassages(userId, query, maxPassages = 3) {
  const q = sanitizeTextQuery(query);
  if (q.length < 3) return [];
  const notes = await Note.find(
    { userId, $text: { $search: q } },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(maxPassages)
    .select("title content")
    .maxTimeMS(5000)
    .lean();
  return notes.map((n) => ({
    noteId: String(n._id),
    title: n.title,
    passage: extractSnippet(n.content || "", q),
    score: n.score,
  }));
}

router.retrieveNotePassages = retrieveNotePassages;
router.extractSnippet = extractSnippet;
router.sanitizeTextQuery = sanitizeTextQuery;

// GET /api/notes
router.get("/", auth, async (req, res, next) => {
  try {
    const { deleted, isDeleted, subject, search } = req.query;
    const deletedFlag = String(isDeleted ?? deleted ?? "false");
    const filter = buildNotesListFilter({
      userId: req.userId,
      deletedFlag,
      subject,
      search,
    });

    const notes = await Note.find(filter)
      .sort({ updatedAt: -1 })
      .select("title subject tags sourceType summary createdAt updatedAt isDeleted deleted")
      .maxTimeMS(5000);

    res.json({ notes });
  } catch (error) {
    next(error);
  }
});


// GET /api/notes/search?q=... — ranked full-text search (slice 159).
// Unlike the list's `search` param (unranked regex over title/content/tags),
// this uses the note_text_search index: stemmed, weighted, ordered by
// relevance, with a match snippet per note. Must stay above /:id.
router.get("/search", auth, async (req, res, next) => {
  try {
    const q = sanitizeTextQuery(req.query.q);
    if (q.length < 2) return res.json({ notes: [] });
    const notes = await Note.find(
      { userId: req.userId, $text: { $search: q } },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10)
      .select("title subject tags sourceType summary createdAt updatedAt content")
      .maxTimeMS(5000)
      .lean();
    res.json({
      notes: notes.map((n) => ({
        _id: String(n._id),
        title: n.title,
        subject: n.subject,
        tags: n.tags,
        sourceType: n.sourceType,
        summary: n.summary,
        updatedAt: n.updatedAt,
        snippet: extractSnippet(n.content || "", q),
        score: n.score,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/notes/:id
router.get("/:id", auth, async (req, res, next) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: req.userId });
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ note });
  } catch (error) {
    next(error);
  }
});

// POST /api/notes
const createSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional().default(""),
  subject: z.string().optional().default("General"),
  tags: z.array(z.string()).optional().default([]),
  sourceType: z.enum(["manual", "pdf", "ai"]).optional().default("manual"),
});

router.post("/", auth, validate(createSchema), async (req, res, next) => {
  try {
    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        error: "Demo account cannot create notes.",
      });
    }

    const { title, content, subject, tags, sourceType } = req.body;
    const note = await Note.create({
      userId: req.userId,
      title,
      content,
      subject,
      tags,
      sourceType,
      isDeleted: false,
      deleted: false,
    });
    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notes/:id
const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  subject: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        content: z.string(),
      }),
    )
    .optional(),
  keyTerms: z
    .array(
      z.object({
        term: z.string(),
        definition: z.string(),
      }),
    )
    .optional(),
});

async function updateNoteHandler(req, res, next) {
  try {
    const existingNote = await Note.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!existingNote) return res.status(404).json({ error: "Note not found" });
    if (existingNote.isDemoNote) {
      return res.status(403).json({
        success: false,
        error: "Demo notes are read-only.",
      });
    }

    // req.body is the parsed, allowlisted update (validate middleware
    // assigns Zod output); $set + runValidators means a $ operator or
    // a field outside updateSchema can never reach MongoDB (Backend M4).
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: req.body },
      { new: true, runValidators: true },
    );
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ note });
  } catch (error) {
    next(error);
  }
}

router.patch("/:id", auth, validate(updateSchema), updateNoteHandler);
router.put("/:id", auth, validate(updateSchema), updateNoteHandler);

// DELETE /api/notes/:id — soft delete
router.delete("/:id", auth, async (req, res, next) => {
  try {
    const existingNote = await Note.findOne({ _id: req.params.id, userId: req.userId });
    if (!existingNote) return res.status(404).json({ error: "Note not found" });
    if (existingNote.isDemoNote) {
      return res.status(403).json({
        success: false,
        error: "Demo notes cannot be deleted.",
      });
    }

    const updatedNote = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isDeleted: true, deleted: true },
      { new: true },
    );
    if (!updatedNote) return res.status(404).json({ error: "Note not found" });
    res.json({ note: updatedNote, message: "Note moved to trash" });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notes/:id/restore
router.patch("/:id/restore", auth, async (req, res, next) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isDeleted: false, deleted: false },
      { new: true },
    );
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ note });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notes/:id/permanent
router.delete("/:id/permanent", auth, async (req, res, next) => {
  try {
    const existingNote = await Note.findOne({ _id: req.params.id, userId: req.userId });
    if (!existingNote) return res.status(404).json({ error: "Note not found" });
    if (existingNote.isDemoNote) {
      return res.status(403).json({
        success: false,
        error: "Demo notes cannot be deleted.",
      });
    }

    const deletedNote = await Note.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!deletedNote) return res.status(404).json({ error: "Note not found" });
    res.json({ message: "Note permanently deleted" });
  } catch (error) {
    next(error);
  }
});

// POST /api/notes/:id/summarize
router.post("/:id/summarize", auth, dynamicAiLimiter, async (req, res, next) => {
  try {
    const access = await requireOpenRouterAccess(req, res);
    if (!access) return;

    const note = await Note.findOne({ _id: req.params.id, userId: req.userId });
    if (!note) {
      await refundCreditSpend(req);
      return res.status(404).json({ error: "Note not found" });
    }
    if (!note.content || note.content.length < 50) {
      await refundCreditSpend(req);
      return res
        .status(400)
        .json({ error: "Note content too short to summarize" });
    }

    const summary = await summarizeContent(note.content, "concise", {
      apiKey: access.apiKey,
      onUsage: usageCallbackFor(req.userId, "notes-summarize"),
    });
    res.json({ summary });
  } catch (error) {
    await refundCreditSpend(req);
    next(error);
  }
});

// POST /api/notes/:id/translate
const translateSchema = z.object({
  language: z.string().min(2).max(80),
});

router.post(
  "/:id/translate",
  auth,
  dynamicAiLimiter,
  validate(translateSchema),
  async (req, res, next) => {
    try {
      const access = await requireOpenRouterAccess(req, res);
      if (!access) return;

      const note = await Note.findOne({ _id: req.params.id, userId: req.userId });
      if (!note) {
        await refundCreditSpend(req);
        return res.status(404).json({ error: "Note not found" });
      }
      if (!note.content || note.content.trim().length < 10) {
        await refundCreditSpend(req);
        return res.status(400).json({ error: "Note content too short to translate" });
      }

      const language = req.body.language;
      const translated = await callOpenRouter(
        [
          {
            role: "system",
            content: `Translate study notes into ${language}.
Preserve structure and formatting.
Return only the translated text without extra commentary.`,
          },
          {
            role: "user",
            content: truncateAiInput(note.content),
          },
        ],
        { temperature: 0.2, apiKey: access.apiKey, onUsage: usageCallbackFor(req.userId, "notes-translate") },
      );

      res.json({ translated: String(translated || "").trim(), language });
    } catch (error) {
      await refundCreditSpend(req);
      next(error);
    }
  },
);

module.exports = router;
