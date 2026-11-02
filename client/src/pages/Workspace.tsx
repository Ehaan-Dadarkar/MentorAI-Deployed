import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useAuthStore } from "@/store/authStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Upload, Trash2, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
    whileHover="hover" whileTap="tap" initial="initial"
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
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 }, tap: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-0.5 bg-[#FF3D00]"
    />
    <motion.div
      variants={{ initial: { scaleX: 1, originX: 1 }, hover: { scaleX: 0, originX: 1 }, tap: { scaleX: 0, originX: 1 } }}
      transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#262626]"
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
    whileHover="hover" whileTap="tap" initial="initial"
    onClick={onClick}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden",
      "bg-transparent px-4 py-3",
      "text-label font-bold tracking-widest text-[#8a8a8a] uppercase",
      "hover:text-[#FAFAFA] transition-colors",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 }, tap: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.15, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#FAFAFA]"
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
      "text-label font-bold tracking-widest text-[#FAFAFA] uppercase",
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
    notes, trashNotes, filters, activeNote, editorContent, isLoading, isSaving, isImportingPdf,
    fetchWorkspaceData, loadNote, createNote, saveActiveNote,
    importPdf, deleteNote, updateEditorContent,
    setSearch, setSubjectFilter, restoreNote, deletePermanently,
  } = useWorkspaceStore();
  const { user } = useAuthStore();

  const [titleDraft, setTitleDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  // M4: disclosure shown after a PDF import whose structure was
  // built from only the first N characters of the PDF text.
  const [pdfTruncationNotice, setPdfTruncationNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isApplyingEditorContentRef = useRef(false);
  const dirtyDebounceTimerRef = useRef<number | null>(null);
  const isDemoUser = Boolean(user?.isDemo);
  const isDemoNote = Boolean(activeNote?.isDemoNote);
  const isDirtyRef = useRef(false);
  const titleDraftRef = useRef("");

  // Mirrors for the mount-once guards below: they must read the latest
  // dirty state, not a stale render-scope closure.
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { titleDraftRef.current = titleDraft; }, [titleDraft]);

  // M10: search is debounced — the store filter is server-side, so
  // every keystroke must not fire two API calls. setSearch is
  // synchronous in zustand, so fetchWorkspaceData below reads the
  // new filter.
  const [searchDraft, setSearchDraft] = useState("");
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchDraft === filters.search) return;
      setSearch(searchDraft);
      void fetchWorkspaceData();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft, filters.search, setSearch, fetchWorkspaceData]);

  // M11: save any unsaved edits of the current note. This also flushes
  // the 600 ms dirty debounce, so edits typed just before a note switch
  // are saved too (the store already holds the latest content: onUpdate
  // writes it synchronously). Used before every action that replaces the
  // active note, and on editor blur. A failed save keeps the dirty flag,
  // so the autosave interval retries it; callers still proceed, so a
  // failed save never traps the user on the current note.
  const saveDirtyEdits = async () => {
    const hadPendingEdit = dirtyDebounceTimerRef.current !== null;
    if (dirtyDebounceTimerRef.current !== null) {
      window.clearTimeout(dirtyDebounceTimerRef.current);
      dirtyDebounceTimerRef.current = null;
    }
    if (!hadPendingEdit && !isDirtyRef.current) return;
    const state = useWorkspaceStore.getState();
    if (!state.activeNote || state.isSaving) return;
    try {
      await saveActiveNote({
        title: titleDraftRef.current.trim() || state.activeNote.title,
        content: state.editorContent,
      });
      setIsDirty(false);
    } catch (e) { console.error(e); }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "START WRITING..." }),
    ],
    content: activeNote?.content || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[50vh] sm:min-h-[60vh] text-base leading-relaxed tracking-normal font-display",
      },
    },
    onBlur: () => { void saveDirtyEdits(); },
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
    if (!editor) return;
    editor.setEditable(!isDemoNote);
  }, [editor, isDemoNote]);

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

  // M11: never lose edits on tab close or in-app navigation. The
  // beforeunload guard covers tab/window close; the unmount save
  // covers SPA route changes (no beforeunload fires, but an in-flight
  // request is not cancelled by them). Both read refs plus the store,
  // never stale render-scope state.
  useEffect(() => {
    const hasUnsavedEdits = () =>
      isDirtyRef.current || dirtyDebounceTimerRef.current !== null;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedEdits()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (!hasUnsavedEdits()) return;
      if (dirtyDebounceTimerRef.current !== null) {
        window.clearTimeout(dirtyDebounceTimerRef.current);
        dirtyDebounceTimerRef.current = null;
      }
      const state = useWorkspaceStore.getState();
      if (!state.activeNote || state.isSaving) return;
      void state.saveActiveNote({
        title: titleDraftRef.current.trim() || state.activeNote.title,
        content: state.editorContent,
      }).catch((e) => console.error(e));
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
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [activeNote, editorContent, isDirty, isSaving, saveActiveNote, titleDraft]);

  // M10: subjects come from the notes on screen, plus the active
  // filter (a filtered list would otherwise drop its own chip).
  const subjects = Array.from(
    new Set([
      ...notes.map((note) => note.subject || "General"),
      ...(filters.subject ? [filters.subject] : []),
    ]),
  );

  const handleSelectSubject = (subject: string | null) => {
    setSubjectFilter(subject);
    void fetchWorkspaceData();
  };

  const handleClearFilters = () => {
    setSearchDraft("");
    setSearch("");
    setSubjectFilter(null);
    void fetchWorkspaceData();
  };

  const handleRestoreNote = async (noteId: string) => {
    try {
      await restoreNote(noteId);
      await fetchWorkspaceData();
    } catch (e) { console.error(e); }
  };

  const handleDeletePermanently = async (noteId: string) => {
    try {
      await deletePermanently(noteId);
      await fetchWorkspaceData();
    } catch (e) { console.error(e); }
  };

  const handleCreateNote = async () => {
    if (isDemoUser) return;
    await saveDirtyEdits();
    try {
      await createNote({ title: "UNTITLED NOTE", content: "", subject: "General" });
      setIsDirty(false);
    } catch (e) { console.error(e); }
  };

  // H10: honour /workspace?new=true deep links (Nexus "New Note"
  // command). Follows the Tutor ?topic= deep-link pattern: apply once,
  // then clear the query (replace) so a refresh does not create a
  // second note. handleCreateNote already guards demo users.
  const deepLinkNewAppliedRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (deepLinkNewAppliedRef.current) return;
    if (searchParams.get("new") !== "true") return;
    deepLinkNewAppliedRef.current = true;
    setSearchParams({}, { replace: true });
    void handleCreateNote();
  }, [searchParams, setSearchParams, handleCreateNote]);

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isDemoUser) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (await guardOpenRouterAction()) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    await saveDirtyEdits();
    try {
      const result = await importPdf(file);
      setIsDirty(false);
      // M4: the AI structures only the first N chars of the PDF -
      // say so honestly instead of silently truncating.
      if (result.structuredFrom?.truncated) {
        const { charLimit, totalChars } = result.structuredFrom;
        setPdfTruncationNotice(
          `STRUCTURED FROM THE FIRST ${charLimit.toLocaleString("en-US")} OF ${totalChars.toLocaleString("en-US")} CHARACTERS OF THIS PDF.`,
        );
      } else {
        setPdfTruncationNotice(null);
      }
    } catch (err) { console.error(err); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleSelectNote = async (noteId: string) => {
    await saveDirtyEdits();
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

  // M4: the truncation notice belongs to the import that produced it -
  // clear it when switching notes or closing the editor.
  const activeNoteId = activeNote?._id;
  useEffect(() => { setPdfTruncationNotice(null); }, [activeNoteId]);

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
                      <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#8a8a8a] uppercase">
                        {/* ↓ shorter subtitle on mobile */}
                        <span className="hidden sm:inline">NOTES, IMPORTED PDFS, AND RAW THOUGHT.</span>
                        <span className="sm:hidden">NOTES & PDFS.</span>
                      </p>
                    </motion.div>
                  </div>

                  {/* ↓ row on mobile, column from sm */}
                  <motion.div variants={fadeUp} className="flex flex-row sm:flex-col gap-3 sm:gap-4 sm:min-w-50">
                    <PrimaryButton
                      onClick={handleCreateNote}
                      disabled={isDemoUser}
                      className="flex-1 sm:flex-none justify-center sm:justify-start"
                    >
                      <span className="hidden sm:inline">
                        {isDemoUser ? "READ ONLY" : "NEW NOTE"}
                      </span>
                      <span className="sm:hidden">{isDemoUser ? "READ ONLY" : "NEW"}</span>
                      {!isDemoUser && <Plus className="w-4 h-4 ml-1" />}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImportingPdf || isDemoUser}
                      className="flex-1 sm:flex-none justify-center"
                    >
                      {isDemoUser ? (
                        <>
                          <span className="hidden sm:inline">READ ONLY</span>
                          <span className="sm:hidden">READ ONLY</span>
                        </>
                      ) : isImportingPdf ? (
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
                  <div className="h-px flex-1 bg-[#262626]" />
                  <span className="text-xs font-bold tracking-[0.2em] text-[#8a8a8a] uppercase">
                    {notes.length.toString().padStart(2, "0")}
                    <span className="hidden sm:inline"> ITEMS</span>
                  </span>
                </div>

                {/* SEARCH + SUBJECT FILTERS — M10: the store already
                    filtered server-side; this wires it to the UI. */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 sm:mb-12">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#8a8a8a] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      placeholder="SEARCH NOTES..."
                      className="w-full h-10 bg-transparent border border-[#262626] pl-10 pr-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-8 sm:mb-12">
                  <button
                    type="button"
                    onClick={() => handleSelectSubject(null)}
                    className={cn(
                      "text-label font-bold tracking-widest uppercase px-3 py-1.5 border transition-all duration-150",
                      !filters.subject
                        ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                        : "bg-transparent text-[#8a8a8a] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
                    )}
                  >
                    All
                  </button>
                  {subjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => handleSelectSubject(subject)}
                      className={cn(
                        "text-label font-bold tracking-widest uppercase px-3 py-1.5 border transition-all duration-150",
                        filters.subject === subject
                          ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                          : "bg-transparent text-[#8a8a8a] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
                      )}
                    >
                      {subject}
                    </button>
                  ))}
                </div>

                {isLoading && notes.length === 0 ? (
                  <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
                    <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#8a8a8a] uppercase">
                      LOADING...
                    </p>
                  </div>
                ) : notes.length === 0 ? (
                  <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
                    <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
                      {filters.search || filters.subject ? "NO MATCHES." : "VOID."}
                    </h3>
                    <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#8a8a8a] uppercase mb-8 max-w-sm">
                      {filters.search || filters.subject
                        ? "NO NOTES MATCH YOUR SEARCH OR FILTER. CLEAR THEM TO SEE EVERYTHING."
                        : "YOUR WORKSPACE IS EMPTY. CREATE A NOTE OR IMPORT A PDF TO BEGIN."}
                    </p>
                    {filters.search || filters.subject ? (
                      <PrimaryButton onClick={handleClearFilters}>
                        CLEAR FILTERS <ArrowRight className="w-4 h-4 ml-1" />
                      </PrimaryButton>
                    ) : (
                      <PrimaryButton onClick={handleCreateNote}>
                        NEW NOTE <ArrowRight className="w-4 h-4 ml-1" />
                      </PrimaryButton>
                    )}
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
                        className="group relative border-b border-r border-[#262626] p-5 sm:p-8 cursor-pointer overflow-hidden flex flex-col min-h-50 sm:min-h-65 lg:min-h-75"
                        onClick={() => handleSelectNote(note._id)}
                      >
                        <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />

                        <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                          <div className="flex-1">
                            <p className="text-label font-bold tracking-[0.2em] uppercase mb-3 sm:mb-4 opacity-50 group-hover:opacity-100 transition-opacity">
                              {formatDate(note.createdAt)}
                            </p>
                            {/* ↓ title scales from text-xl */}
                            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-4 group-hover:text-[#0A0A0A] line-clamp-3">
                              {note.title || "UNTITLED NOTE"}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between mt-6 sm:mt-8">
                            <span className="text-label font-bold tracking-[0.2em] uppercase border border-current px-2 sm:px-3 py-1 opacity-50 group-hover:opacity-100">
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

              {/* TRASH SECTION — M10: a trashed note is restorable again,
                  and permanently deletable, from the UI that trashed it. */}
              <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-8 sm:py-12 md:py-16 border-t border-[#262626]">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
                  <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">
                    TRASH
                  </h2>
                  <div className="h-px flex-1 bg-[#262626]" />
                  <span className="text-xs font-bold tracking-[0.2em] text-[#8a8a8a] uppercase">
                    {trashNotes.length.toString().padStart(2, "0")}
                    <span className="hidden sm:inline"> ITEMS</span>
                  </span>
                </div>

                {trashNotes.length === 0 ? (
                  <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
                    <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#8a8a8a] uppercase">
                      TRASH IS EMPTY.
                    </p>
                  </div>
                ) : (
                  <div className="border-t border-l border-[#262626] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {trashNotes.map((note) => (
                      <div
                        key={note._id}
                        className="border-b border-r border-[#262626] p-5 sm:p-8 flex flex-col"
                      >
                        <p className="text-label font-bold tracking-[0.2em] uppercase mb-3 sm:mb-4 opacity-50">
                          {formatDate(note.createdAt)}
                        </p>
                        <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-4 line-clamp-3">
                          {note.title || "UNTITLED NOTE"}
                        </h3>
                        <div className="flex items-center gap-3 mt-6 sm:mt-8">
                          <button
                            type="button"
                            onClick={() => handleRestoreNote(note._id)}
                            className="text-label font-bold tracking-widest text-[#FAFAFA] uppercase hover:text-[#FF3D00] transition-colors"
                          >
                            RESTORE
                          </button>
                          <span className="text-label text-[#262626]">|</span>
                          <button
                            type="button"
                            onClick={() => handleDeletePermanently(note._id)}
                            className="text-label font-bold tracking-widest text-[#8a8a8a] uppercase hover:text-[#FF3D00] transition-colors"
                          >
                            DELETE PERMANENTLY
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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
                        className="text-label font-bold tracking-[0.2em] text-[#FF3D00] uppercase animate-pulse"
                      >
                        SAVING...
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* Save button — visible when dirty and not currently saving */}
                  <AnimatePresence>
                    {!isDemoNote && isDirty && !isSaving && (
                      <motion.div
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <PrimaryButton
                          onClick={async () => {
                            if (!activeNote) return;
                            try {
                              await saveActiveNote({
                                title: titleDraft.trim() || activeNote.title,
                                content: editorContent,
                              });
                              setIsDirty(false);
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          disabled={isSaving}
                          className="py-2 px-4 text-label"
                        >
                          SAVE
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </PrimaryButton>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Dot shown only while a save is in flight */}
                  {!isDemoNote && isDirty && isSaving && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[#FF3D00] shrink-0"
                      title="Unsaved changes"
                    />
                  )}
                  {!isDemoNote && (
                    <GhostButton
                      onClick={handleMoveToTrash}
                      className="hover:text-[#FF3D00] px-2 sm:px-4"
                    >
                      <Trash2 className="w-4 h-4" />
                    </GhostButton>
                  )}
                </div>
              </div>

              {isDemoNote && (
                <div className="flex items-center gap-3 border border-[#FF3D00]/30 bg-[#FF3D00]/5 px-4 py-3 mb-6">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF3D00] shrink-0" />
                  <p className="text-label font-bold tracking-[0.16em] text-[#FF3D00] uppercase">
                    DEMO NOTE — READ ONLY. REGISTER A FREE ACCOUNT TO CREATE AND EDIT YOUR OWN NOTES.
                  </p>
                </div>
              )}

              {pdfTruncationNotice && (
                <div className="flex items-center gap-3 border border-[#262626] bg-[#1A1A1A] px-4 py-3 mb-6">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF3D00] shrink-0" />
                  <p className="flex-1 text-label font-bold tracking-[0.16em] text-[#8a8a8a] uppercase">
                    {pdfTruncationNotice}
                  </p>
                  <button
                    onClick={() => setPdfTruncationNotice(null)}
                    className="text-[#737373] hover:text-[#FAFAFA] transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── NOTE HEADER ── */}
              <div className="mb-8 sm:mb-12">
                {/* ↓ title input scales from text-3xl on mobile */}
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleBlur}
                  readOnly={isDemoNote}
                  placeholder="UNTITLED NOTE"
                  className={cn(
                    "w-full bg-transparent text-3xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none uppercase leading-tight",
                    isDemoNote && "cursor-not-allowed",
                  )}
                />
                <div className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6">
                  <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                  <p className="text-label font-bold tracking-[0.2em] text-[#8a8a8a] uppercase border border-[#262626] px-2 sm:px-3 py-1">
                    {activeNote.subject || "GENERAL"}
                  </p>
                  {/* ↓ show formatted date on sm+ as extra context */}
                  {activeNote.createdAt && (
                    <p className="hidden sm:block text-label font-bold tracking-[0.2em] text-[#8a8a8a] uppercase">
                      {formatDate(activeNote.createdAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* ── EDITOR BODY ── */}
              {/* ↓ slightly reduced top padding on mobile */}
              <div className="pt-6 sm:pt-8 text-base sm:text-lg font-display prose-p:text-[#FAFAFA] prose-headings:text-[#FAFAFA]">
                <EditorContent editor={editor} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </PageWrapper>
  );
}