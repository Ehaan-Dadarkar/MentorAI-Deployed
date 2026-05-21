const express = require("express");
const { z } = require("zod");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { summarizeContent, callOpenRouter } = require("../services/ai");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");
const Note = require("../models/Note");

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

// GET /api/notes
router.get("/", auth, async (req, res, next) => {
  try {
    const { deleted, isDeleted, subject, search } = req.query;
    const filter = { userId: req.userId };
    const deletedFlag = String(isDeleted ?? deleted ?? "false");

    Object.assign(filter, buildDeletedQuery(deletedFlag));

    if (subject) {
      filter.subject = subject;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    const notes = await Note.find(filter)
      .sort({ updatedAt: -1 })
      .select("title subject tags sourceType summary createdAt updatedAt isDeleted deleted");

    res.json({ notes });
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

    const note = await Note.create({
      userId: req.userId,
      ...req.body,
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

    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true },
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
    if (!note) return res.status(404).json({ error: "Note not found" });
    if (!note.content || note.content.length < 50) {
      return res
        .status(400)
        .json({ error: "Note content too short to summarize" });
    }

    const summary = await summarizeContent(note.content, "concise", {
      apiKey: access.apiKey,
    });
    res.json({ summary });
  } catch (error) {
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
      if (!note) return res.status(404).json({ error: "Note not found" });
      if (!note.content || note.content.trim().length < 10) {
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
            content: note.content,
          },
        ],
        { temperature: 0.2, apiKey: access.apiKey },
      );

      res.json({ translated: String(translated || "").trim(), language });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
