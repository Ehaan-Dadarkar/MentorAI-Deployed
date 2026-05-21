const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const auth = require("../middleware/auth");
const { dynamicAiLimiter } = require("../middleware/rateLimiter");
const { extractTextFromPDF } = require("../services/pdfParser");
const { callOpenRouter } = require("../services/ai");
const { requireOpenRouterAccess } = require("../services/openrouterAccess");
const Note = require("../models/Note");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const looksLikePdf =
      file.mimetype === "application/pdf" ||
      String(file.originalname || "").toLowerCase().endsWith(".pdf");

    if (looksLikePdf) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const structuredPdfSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  sections: z
    .array(
      z.object({
        heading: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  keyTerms: z
    .array(
      z.object({
        term: z.string().optional(),
        definition: z.string().optional(),
      }),
    )
    .optional(),
  suggestedSubject: z.string().optional(),
});

function cleanText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToParagraphsHtml(value) {
  const paragraphs = cleanText(value)
    .split(/\n+/)
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "";
  }

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function parseStructuredPdf(rawText) {
  const content = String(rawText || "").trim();

  if (!content) {
    throw new Error("Empty AI response");
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Continue to fallback extraction.
  }

  const withoutCodeFence = content.replace(/```json|```/gi, "").trim();

  const objectMatch = withoutCodeFence.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      throw new Error("AI returned invalid JSON");
    }
  }

  throw new Error("AI returned invalid JSON");
}

function normalizeStructuredPayload(rawPayload, fallbackTitle, rawText) {
  const parsed = structuredPdfSchema.parse(rawPayload);

  const title = cleanText(parsed.title) || cleanText(fallbackTitle) || "Imported PDF";
  const summary = cleanText(parsed.summary);
  const suggestedSubject = cleanText(parsed.suggestedSubject) || "General";

  let sections = (parsed.sections || [])
    .map((section) => ({
      heading: cleanText(section.heading) || "Section",
      content: cleanText(section.content),
    }))
    .filter((section) => section.heading || section.content);

  if (sections.length === 0) {
    sections = [
      {
        heading: "Imported Content",
        content: cleanText(rawText).slice(0, 12_000),
      },
    ];
  }

  const seenTerms = new Set();
  const keyTerms = (parsed.keyTerms || [])
    .map((term) => ({
      term: cleanText(term.term),
      definition: cleanText(term.definition),
    }))
    .filter((term) => {
      if (!term.term) return false;
      const normalized = term.term.toLowerCase();
      if (seenTerms.has(normalized)) return false;
      seenTerms.add(normalized);
      return true;
    })
    .slice(0, 80);

  return {
    title,
    summary,
    sections,
    keyTerms,
    suggestedSubject,
  };
}

function generateHTMLFromAI(data) {
  let html = "";

  html += `<h1>${escapeHtml(data.title || "Imported PDF")}</h1>`;

  if (data.summary) {
    html += `<br /><p><strong>Summary:</strong> ${escapeHtml(data.summary)}</p>`;
  }

  (data.sections || []).forEach((section) => {
    const heading = cleanText(section.heading) || "Section";
    html += `<br /><h2>${escapeHtml(heading)}</h2>`;

    const contentHtml = textToParagraphsHtml(section.content);
    html += contentHtml || "<p></p>";
  });

  if ((data.keyTerms || []).length > 0) {
    html += "<br /><h3>Key Terms</h3><ul>";

    data.keyTerms.forEach((term) => {
      const safeTerm = escapeHtml(term.term || "");
      const safeDefinition = escapeHtml(term.definition || "");
      html += `<li><strong>${safeTerm}:</strong> ${safeDefinition}</li>`;
    });

    html += "</ul>";
  }

  return html;
}

function uploadPdfMiddleware(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "PDF file size must be 50MB or less" });
      }
      return res.status(400).json({ error: error.message });
    }

    if (error.message === "Only PDF files are allowed") {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  });
}

// POST /api/upload/pdf
router.post("/pdf", auth, dynamicAiLimiter, uploadPdfMiddleware, async (req, res, next) => {
  try {
    // Allow longer request/response socket timeout for AI processing (3 minutes)
    try { req.setTimeout(180000); } catch (e) {}
    try { res.setTimeout(180000); } catch (e) {}

    const access = await requireOpenRouterAccess(req, res);
    if (!access) return;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let parsedPdf;
    try {
      parsedPdf = await extractTextFromPDF(req.file.buffer);
    } catch {
      return res.status(422).json({ error: "Failed to parse PDF file" });
    }

    const { text, numPages } = parsedPdf;

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: "Could not extract text from PDF" });
    }

    // Limit the text sent to AI to reduce processing time.
    // The full extracted text stays available in this request for downstream use.
    const textForAI = text.substring(0, 3000);

    const promptMessages = [
      {
        role: "system",
        content: `Extract and structure the content from these lecture notes.
Return JSON: {
  "title": string,
  "summary": string,
  "sections": [{ "heading": string, "content": string }],
  "keyTerms": [{ "term": string, "definition": string }],
  "suggestedSubject": string
}
Return only valid JSON.`,
      },
      {
        role: "user",
        content: textForAI,
      },
    ];

    let structuredRaw;
    try {
      structuredRaw = await Promise.race([
        callOpenRouter(promptMessages, {
          model: "meta-llama/llama-3.1-8b-instruct",
          temperature: 0.3,
          apiKey: access.apiKey,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI processing timeout")), 60000),
        ),
      ]);
    } catch {
      return res.status(502).json({ error: "AI service failed to process PDF content" });
    }

    const fallbackTitle = req.file.originalname.replace(/\.pdf$/i, "");
    let normalized;

    try {
      const parsed = parseStructuredPdf(String(structuredRaw || ""));
      normalized = normalizeStructuredPayload(parsed, req.body.title || fallbackTitle, text);
    } catch {
      return res.status(502).json({ error: "AI returned invalid JSON structure" });
    }

    const content = generateHTMLFromAI(normalized);
    const subject = cleanText(req.body.subject) || normalized.suggestedSubject || "General";
    const termTags = normalized.keyTerms.map((term) => term.term).slice(0, 8);

    const note = await Note.create({
      userId: req.userId,
      title: normalized.title,
      content,
      summary: normalized.summary,
      sections: normalized.sections,
      keyTerms: normalized.keyTerms,
      subject,
      sourceType: "pdf",
      isDeleted: false,
      deleted: false,
      tags: ["imported", "pdf", ...termTags],
    });

    res.status(201).json({
      note,
      numPages,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
