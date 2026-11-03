const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    content: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      default: "",
    },
    sections: {
      type: [
        new mongoose.Schema(
          {
            heading: { type: String, trim: true, default: "" },
            content: { type: String, default: "" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    keyTerms: {
      type: [
        new mongoose.Schema(
          {
            term: { type: String, trim: true, default: "" },
            definition: { type: String, default: "" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    subject: {
      type: String,
      trim: true,
      default: "General",
    },
    tags: {
      type: [String],
      default: [],
    },
    sourceType: {
      type: String,
      enum: ["manual", "pdf", "ai"],
      default: "manual",
    },
    isDemoNote: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

noteSchema.pre("save", async function () {
  if (this.isDeleted) {
    this.deletedAt = new Date();
  } else {
    this.deletedAt = null;
  }

  this.deleted = this.isDeleted;
});

noteSchema.index({ userId: 1, isDeleted: 1 });
noteSchema.index({ userId: 1, deleted: 1 });
noteSchema.index({ userId: 1, subject: 1 });
// Full-text search (slice 159): ranked, stemmed search over title,
// content and tags. Powers /api/notes/search and the tutor's automatic
// note retrieval. Weights: title > tags > content.
noteSchema.index(
  { title: "text", content: "text", tags: "text" },
  { weights: { title: 10, tags: 5, content: 1 }, name: "note_text_search" },
);


module.exports = mongoose.model("Note", noteSchema);
