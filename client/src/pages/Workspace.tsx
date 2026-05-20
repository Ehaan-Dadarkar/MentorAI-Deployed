import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Animation Config (copy to every page) ─────────────────────
const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: easing } 
  },
};

// ── Button Components (Use These Exactly) ─────────────────────
const PrimaryButton = ({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <motion.button
    whileHover="hover"
    initial="initial"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden",
      "bg-transparent px-6 py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
      "disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{
        initial: { scaleX: 0, originX: 0 },
        hover: { scaleX: 1, originX: 0 },
      }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#FF3D00]"
    />
    <motion.div
      variants={{
        initial: { scaleX: 1, originX: 1 },
        hover: { scaleX: 0, originX: 1 },
      }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[1px] bg-[#262626]"
    />
  </motion.button>
);

const GhostButton = ({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <motion.button
    whileHover="hover"
    initial="initial"
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
      variants={{
        initial: { scaleX: 0, originX: 0 },
        hover: { scaleX: 1, originX: 0 },
      }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[1px] bg-[#FAFAFA]"
    />
  </motion.button>
);

const SecondaryButton = ({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative inline-flex items-center justify-center gap-2",
      "border border-[#262626] bg-[#0A0A0A] px-6 py-4",
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

// ── Main Page Component ─────────────────────
export default function Workspace() {
  const {
    notes,
    activeNote,
    editorContent,
    isLoading,
    isSaving,
    isImportingPdf,
    fetchWorkspaceData,
    loadNote,
    createNote,
    saveActiveNote,
    importPdf,
    deleteNote,
    updateEditorContent,
  } = useWorkspaceStore();

  const [titleDraft, setTitleDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isApplyingEditorContentRef = useRef(false);
  const dirtyDebounceTimerRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "START WRITING...",
      }),
    ],
    content: activeNote?.content || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[60vh] text-base leading-relaxed tracking-normal font-['Inter_Tight','Inter',sans-serif]",
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
    const timeout = window.setTimeout(() => {
      void fetchWorkspaceData();
    }, 180);

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
          await saveActiveNote({
            title: titleDraft.trim() || activeNote.title,
            content: editorContent,
          });
          setIsDirty(false);
        } catch (e) {
          console.error(e);
        }
      })();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [activeNote, editorContent, isDirty, isSaving, saveActiveNote, titleDraft]);

  const handleCreateNote = async () => {
    try {
      await createNote({ title: "UNTITLED NOTE", content: "", subject: "General" });
      setIsDirty(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importPdf(file);
      setIsDirty(false);
    } catch (err) {
      console.error(err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectNote = async (noteId: string) => {
    try {
      await loadNote(noteId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTitleBlur = async () => {
    if (!activeNote) return;

    const nextTitle = titleDraft.trim() || "UNTITLED NOTE";
    if (nextTitle === activeNote.title) return;

    try {
      await saveActiveNote({ title: nextTitle });
      setTitleDraft(nextTitle);
    } catch (e) {
      console.error(e);
    }
  };

  const handleMoveToTrash = async () => {
    if (!activeNote) return;

    try {
      await deleteNote(activeNote._id);
      setIsDirty(false);
      useWorkspaceStore.setState({ activeNote: null });
    } catch (e) {
      console.error(e);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <PageWrapper>
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-32">
        
        {/* NOISE TEXTURE - Always include */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-50"
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

        {!activeNote ? (
          <>
            {/* HERO SECTION */}
            <div className="relative pt-32 pb-16 px-8 md:px-16 border-b border-[#262626]">
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-12"
              >
                <div>
                  <motion.h1 
                    variants={fadeUp}
                    className="text-7xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none"
                  >
                    WORKSPACE.
                  </motion.h1>
                  <motion.div 
                    variants={fadeUp}
                    className="mt-6 flex items-center gap-6"
                  >
                    <div className="h-1 w-12 bg-[#FF3D00]" />
                    <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                      NOTES, IMPORTED PDFS, AND RAW THOUGHT.
                    </p>
                  </motion.div>
                </div>
                
                <motion.div variants={fadeUp} className="flex flex-col gap-4 min-w-[200px]">
                  <PrimaryButton onClick={handleCreateNote}>
                    NEW NOTE <Plus className="w-4 h-4 ml-1" />
                  </PrimaryButton>
                  <SecondaryButton onClick={() => fileInputRef.current?.click()} disabled={isImportingPdf}>
                    {isImportingPdf ? "IMPORTING..." : "IMPORT PDF"} <Upload className="w-4 h-4 ml-1" />
                  </SecondaryButton>
                </motion.div>
              </motion.div>
            </div>

            {/* MAIN CONTENT */}
            <div className="max-w-7xl mx-auto px-8 md:px-16 py-16">
              
              <div className="flex items-center gap-4 mb-12">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">
                  ARCHIVES
                </h2>
                <div className="h-[1px] flex-1 bg-[#262626]" />
                <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                  {notes.length.toString().padStart(2, "0")} ITEMS
                </span>
              </div>

              {isLoading && notes.length === 0 ? (
                <div className="border border-[#262626] p-16 flex flex-col items-center text-center">
                  <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
                    LOADING...
                  </p>
                </div>
              ) : notes.length === 0 ? (
                <div className="border border-[#262626] p-16 flex flex-col items-center text-center">
                  <h3 className="text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
                    VOID.
                  </h3>
                  <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
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
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]"
                >
                  {notes.map((note) => (
                    <motion.div
                      key={note._id}
                      variants={fadeUp}
                      className="group relative border-b border-r border-[#262626] p-8 cursor-pointer overflow-hidden flex flex-col min-h-[300px]"
                      onClick={() => handleSelectNote(note._id)}
                    >
                      {/* White background reveal on hover */}
                      <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                      
                      <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                        <div className="flex-1">
                          <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4 opacity-50 group-hover:opacity-100 transition-opacity">
                            {formatDate(note.createdAt)}
                          </p>
                          <h3 className="text-2xl font-bold tracking-tight mb-4 group-hover:text-[#0A0A0A] line-clamp-3">
                            {note.title || "UNTITLED NOTE"}
                          </h3>
                        </div>
                        <div className="flex items-center justify-between mt-8">
                          <span className="text-[10px] font-bold tracking-[0.2em] uppercase border border-current px-3 py-1 opacity-50 group-hover:opacity-100">
                            {note.subject || "GENERAL"}
                          </span>
                          <ArrowRight className="w-5 h-5 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </>
        ) : (
          <div className="max-w-4xl mx-auto px-8 md:px-16 pt-16 pb-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: easing }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-16 pb-8 border-b border-[#262626]">
                <GhostButton onClick={() => useWorkspaceStore.setState({ activeNote: null })}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> RETURN TO ARCHIVES
                </GhostButton>
                
                <div className="flex items-center gap-4">
                  {isSaving && (
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase animate-pulse">
                      SAVING...
                    </span>
                  )}
                  <GhostButton onClick={handleMoveToTrash} className="hover:text-[#FF3D00]">
                    <Trash2 className="w-4 h-4" />
                  </GhostButton>
                </div>
              </div>
              
              <div className="mb-12">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleBlur}
                  placeholder="UNTITLED NOTE"
                  className="w-full bg-transparent text-5xl md:text-7xl font-bold tracking-tighter text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none uppercase"
                />
                <div className="mt-6 flex items-center gap-6">
                  <div className="h-1 w-12 bg-[#FF3D00]" />
                  <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase border border-[#262626] px-3 py-1">
                    {activeNote.subject || "GENERAL"}
                  </p>
                </div>
              </div>

              <div className="pt-8 text-lg font-['Inter_Tight','Inter',sans-serif] prose-p:text-[#FAFAFA] prose-headings:text-[#FAFAFA]">
                <EditorContent editor={editor} />
              </div>
            </motion.div>
          </div>
        )}

      </div>
    </PageWrapper>
  );
}