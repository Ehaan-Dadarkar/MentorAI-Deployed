import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { guardOpenRouterAction } from "@/lib/apiKeyGate";

// ── Animation Config ────────────────────────────────────────
const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

// ── Buttons ─────────────────────────────────────────────────

const PrimaryButton = ({
  children, onClick, className, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <motion.button
    whileHover="hover" initial="initial"
    onClick={onClick} disabled={disabled}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden",
      // ↓ responsive padding
      "bg-transparent px-4 sm:px-6 py-3 sm:py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
      "disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#FF3D00]"
    />
    <motion.div
      variants={{ initial: { scaleX: 1, originX: 1 }, hover: { scaleX: 0, originX: 1 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[1px] bg-[#262626]"
    />
  </motion.button>
);

const GhostButton = ({
  children, onClick, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <motion.button
    whileHover="hover" initial="initial"
    onClick={onClick}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden",
      "bg-transparent px-4 py-3",
      "text-[10px] font-bold tracking-widest text-[#737373] uppercase",
      "hover:text-[#FAFAFA] transition-colors",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[1px] bg-[#FAFAFA]"
    />
  </motion.button>
);

const SecondaryButton = ({
  children, onClick, className, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick} disabled={disabled}
    className={cn(
      "group relative inline-flex items-center justify-center gap-2",
      // ↓ responsive padding
      "border border-[#262626] bg-[#0A0A0A] px-4 sm:px-6 py-3 sm:py-4",
      "text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase",
      "transition-all duration-300",
      "hover:bg-[#FAFAFA] hover:text-[#0A0A0A] hover:border-[#FAFAFA]",
      "disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
  >
    {children}
  </button>
);

// ── Main Page ───────────────────────────────────────────────

export default function Workspace() {
  const {
    notes, activeNote, editorContent, isLoading, isSaving, isImportingPdf,
    fetchWorkspaceData, loadNote, createNote, saveActiveNote,
    importPdf, deleteNote, updateEditorContent,
  } = useWorkspaceStore();

  const [titleDraft, setTitleDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isApplyingEditorContentRef = useRef(false);
  const dirtyDebounceTimerRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "START WRITING..." }),
    ],
    content: activeNote?.content || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[50vh] sm:min-h-[60vh] text-base leading-relaxed tracking-normal font-['Inter_Tight','Inter',sans-serif]",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (isApplyingEditorContentRef.current) return;
      updateEditorContent(currentEditor.getHTML());
      if (dirtyDebounceTimerRef.current !== null) {
        window.clearTimeout(dirtyDebounceTimerRef.current);
      }
      dirtyDebounceTimerRef.current = window.setTimeout(() => {
        setIsDirty(true);
      }, 600);
    },
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => { void fetchWorkspaceData(); }, 180);
    return () => window.clearTimeout(timeout);
  }, [fetchWorkspaceData]);

  useEffect(() => {
    if (!activeNote || !editor) return;
    isApplyingEditorContentRef.current = true;
    editor.commands.setContent(activeNote.content || "");
    updateEditorContent(activeNote.content || "");
    setTitleDraft(activeNote.title || "");
    setIsDirty(false);
    isApplyingEditorContentRef.current = false;
  }, [activeNote, editor, updateEditorContent]);

  useEffect(() => {
    return () => {
      if (dirtyDebounceTimerRef.current !== null) {
        window.clearTimeout(dirtyDebounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!activeNote || !isDirty || isSaving) return;
      void (async () => {
        try {
          await saveActiveNote({ title: titleDraft.trim() || activeNote.title, content: editorContent });
          setIsDirty(false);
        } catch (e) { console.error(e); }
      })();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeNote, editorContent, isDirty, isSaving, saveActiveNote, titleDraft]);

  const handleCreateNote = async () => {
    try {
      await createNote({ title: "UNTITLED NOTE", content: "", subject: "General" });
      setIsDirty(false);
    } catch (e) { console.error(e); }
  };

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (guardOpenRouterAction()) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      await importPdf(file);
      setIsDirty(false);
    } catch (err) { console.error(err); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleSelectNote = async (noteId: string) => {
    try { await loadNote(noteId); } catch (e) { console.error(e); }
  };

  const handleTitleBlur = async () => {
    if (!activeNote) return;
    const nextTitle = titleDraft.trim() || "UNTITLED NOTE";
    if (nextTitle === activeNote.title) return;
    try {
      await saveActiveNote({ title: nextTitle });
      setTitleDraft(nextTitle);
    } catch (e) { console.error(e); }
  };

  const handleMoveToTrash = async () => {
    if (!activeNote) return;
    try {
      await deleteNote(activeNote._id);
      setIsDirty(false);
      useWorkspaceStore.setState({ activeNote: null });
    } catch (e) { console.error(e); }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  };

  return (
    <PageWrapper>
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-8 sm:pb-16 md:pb-32 font-sans">

        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          accept="application/pdf"
          onChange={handleImportPdf}
        />

        <AnimatePresence mode="wait">

          {/* ── LIST VIEW ── */}
          {!activeNote && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: easing }}
            >
              {/* HERO SECTION */}
              {/* ↓ responsive top padding and horizontal gutter */}
              <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  // ↓ stacks on mobile, side-by-side from md
                  className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-12"
                >
                  <div>
                    {/* ↓ heading starts at text-5xl on mobile */}
                    <motion.h1
                      variants={fadeUp}
                      className="text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none"
                    >
                      WORKSPACE.
                    </motion.h1>
                    <motion.div variants={fadeUp} className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6">
                      <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                      <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                        {/* ↓ shorter subtitle on mobile */}
                        <span className="hidden sm:inline">NOTES, IMPORTED PDFS, AND RAW THOUGHT.</span>
                        <span className="sm:hidden">NOTES & PDFS.</span>
                      </p>
                    </motion.div>
                  </div>

                  {/* ↓ row on mobile, column from sm */}
                  <motion.div variants={fadeUp} className="flex flex-row sm:flex-col gap-3 sm:gap-4 sm:min-w-[200px]">
                    <PrimaryButton
                      onClick={handleCreateNote}
                      className="flex-1 sm:flex-none justify-center sm:justify-start"
                    >
                      <span className="hidden sm:inline">NEW NOTE</span>
                      <span className="sm:hidden">NEW</span>
                      <Plus className="w-4 h-4 ml-1" />
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingPdf}
                      className="flex-1 sm:flex-none justify-center"
                    >
                      {isImportingPdf ? (
                        <>
                          <span className="hidden sm:inline">IMPORTING...</span>
                          <span className="sm:hidden">...</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">IMPORT PDF</span>
                          <span className="sm:hidden">PDF</span>
                          <Upload className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </SecondaryButton>
                  </motion.div>
                </motion.div>
              </div>

              {/* ARCHIVES SECTION */}
              <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-8 sm:py-12 md:py-16">

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
                  {/* ↓ heading scales from text-xl */}
                  <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">
                    ARCHIVES
                  </h2>
                  <div className="h-[1px] flex-1 bg-[#262626]" />
                  <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                    {notes.length.toString().padStart(2, "0")}
                    <span className="hidden sm:inline"> ITEMS</span>
                  </span>
                </div>

                {isLoading && notes.length === 0 ? (
                  <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
                    <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                      LOADING...
                    </p>
                  </div>
                ) : notes.length === 0 ? (
                  <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
                    <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
                      VOID.
                    </h3>
                    <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8 max-w-sm">
                      YOUR WORKSPACE IS EMPTY. CREATE A NOTE OR IMPORT A PDF TO BEGIN.
                    </p>
                    <PrimaryButton onClick={handleCreateNote}>
                      NEW NOTE <ArrowRight className="w-4 h-4 ml-1" />
                    </PrimaryButton>
                  </div>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                    // ↓ 1-col mobile, 2-col sm, 3-col lg
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]"
                  >
                    {notes.map((note) => (
                      <motion.div
                        key={note._id}
                        variants={fadeUp}
                        // ↓ reduced padding and min-h on mobile
                        className="group relative border-b border-r border-[#262626] p-5 sm:p-8 cursor-pointer overflow-hidden flex flex-col min-h-[200px] sm:min-h-[260px] lg:min-h-[300px]"
                        onClick={() => handleSelectNote(note._id)}
                      >
                        <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />

                        <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                          <div className="flex-1">
                            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3 sm:mb-4 opacity-50 group-hover:opacity-100 transition-opacity">
                              {formatDate(note.createdAt)}
                            </p>
                            {/* ↓ title scales from text-xl */}
                            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-4 group-hover:text-[#0A0A0A] line-clamp-3">
                              {note.title || "UNTITLED NOTE"}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between mt-6 sm:mt-8">
                            <span className="text-[10px] font-bold tracking-[0.2em] uppercase border border-current px-2 sm:px-3 py-1 opacity-50 group-hover:opacity-100">
                              {note.subject || "GENERAL"}
                            </span>
                            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── EDITOR VIEW ── */}
          {activeNote && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: easing }}
              // ↓ responsive horizontal padding; max-w constrained for reading comfort
              className="max-w-4xl mx-auto px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 md:pt-16 pb-16 sm:pb-24 md:pb-32"
            >
              {/* ── EDITOR TOOLBAR ── */}
              {/* ↓ stacks on mobile, row on md */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 mb-8 sm:mb-12 md:mb-16 pb-6 sm:pb-8 border-b border-[#262626]">

                <GhostButton
                  onClick={() => useWorkspaceStore.setState({ activeNote: null })}
                  className="self-start sm:self-auto px-0"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">RETURN TO ARCHIVES</span>
                  <span className="sm:hidden">BACK</span>
                </GhostButton>

                {/* ↓ save state + delete — always in a row */}
                <div className="flex items-center gap-3 sm:gap-4 self-end sm:self-auto">
                  <AnimatePresence>
                    {isSaving && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase animate-pulse"
                      >
                        SAVING...
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* ↓ dirty indicator dot */}
                  {isDirty && !isSaving && (
                    <span className="w-[6px] h-[6px] rounded-full bg-[#FF3D00] shrink-0" title="Unsaved changes" />
                  )}
                  <GhostButton
                    onClick={handleMoveToTrash}
                    className="hover:text-[#FF3D00] px-2 sm:px-4"
                  >
                    <Trash2 className="w-4 h-4" />
                  </GhostButton>
                </div>
              </div>

              {/* ── NOTE HEADER ── */}
              <div className="mb-8 sm:mb-12">
                {/* ↓ title input scales from text-3xl on mobile */}
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleBlur}
                  placeholder="UNTITLED NOTE"
                  className="w-full bg-transparent text-3xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none uppercase leading-tight"
                />
                <div className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6">
                  <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                  <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase border border-[#262626] px-2 sm:px-3 py-1">
                    {activeNote.subject || "GENERAL"}
                  </p>
                  {/* ↓ show formatted date on sm+ as extra context */}
                  {activeNote.createdAt && (
                    <p className="hidden sm:block text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                      {formatDate(activeNote.createdAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* ── EDITOR BODY ── */}
              {/* ↓ slightly reduced top padding on mobile */}
              <div className="pt-6 sm:pt-8 text-base sm:text-lg font-['Inter_Tight','Inter',sans-serif] prose-p:text-[#FAFAFA] prose-headings:text-[#FAFAFA]">
                <EditorContent editor={editor} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </PageWrapper>
  );
}