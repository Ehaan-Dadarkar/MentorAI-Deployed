import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  BookOpen,
  Check,
  Loader2,
  Pencil,
  Send,
  SlidersHorizontal,
  Trash2,
  User,
  Plus,
  X,
  History,
} from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { cn } from "@/lib/utils";
import { useConversationStore } from "@/store/conversationStore";

const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

// ── Context Modal ─────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function Modal({ open, onClose, children, title }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full sm:max-w-2xl border border-[#262626] bg-[#0A0A0A] p-6 sm:p-8 relative overflow-hidden rounded-t-2xl sm:rounded-none"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              }}
            />
            <div className="relative z-10 flex items-center justify-between mb-6 border-b border-[#262626] pb-4">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tighter uppercase">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="text-[#737373] hover:text-[#FAFAFA] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative z-10">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── History Right Drawer ──────────────────────────────────────
interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  sessions: any[];
  activeSessionId: string | null;
  isBooting: boolean;
  onOpenSession: (id: string) => void;
  onRename: (id: string, name?: string) => void;
  onDelete: (id: string) => void;
}

function HistoryDrawer({
  open,
  onClose,
  sessions,
  activeSessionId,
  isBooting,
  onOpenSession,
  onRename,
  onDelete,
}: HistoryDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 lg:hidden"
            onClick={onClose}
          />

          {/* Drawer — slides from right */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: easing }}
            className="fixed right-0 top-0 bottom-0 z-50 w-72 sm:w-80 bg-[#0A0A0A] border-l border-[#262626] flex flex-col lg:hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-[#262626] shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tracking-tighter uppercase text-[#FAFAFA]">
                  HISTORY
                </span>
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                  {sessions.length.toString().padStart(2, "0")} ITEMS
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-[#737373] hover:text-[#FAFAFA] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-y-auto">
              {isBooting ? (
                <div className="h-24 m-4 border border-[#262626] animate-pulse bg-[#0A0A0A]" />
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                  <div className="w-10 h-10 border border-[#262626] flex items-center justify-center">
                    <History className="w-5 h-5 text-[#737373]" />
                  </div>
                  <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                    NO SESSIONS YET.
                  </p>
                  <p className="text-[10px] text-[#404040] uppercase tracking-wider">
                    START CHATTING TO CREATE ONE.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col border-t border-[#262626]">
                  {sessions.map((session) => {
                    const isActive = session._id === activeSessionId;
                    return (
                      <div
                        key={session._id}
                        className="group relative border-b border-[#262626] p-4 cursor-pointer overflow-hidden flex items-center justify-between"
                      >
                        {/* Hover fill */}
                        <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-300 group-hover:scale-y-100 z-0" />

                        <button
                          onClick={() => onOpenSession(session._id)}
                          className="relative z-10 flex-1 text-left min-w-0"
                        >
                          <p
                            className={cn(
                              "text-xs font-bold tracking-tight uppercase truncate transition-colors",
                              isActive
                                ? "text-[#FF3D00]"
                                : "text-[#FAFAFA] group-hover:text-[#0A0A0A]",
                            )}
                          >
                            {session.name
                              ? session.name
                              : session.promptPreview
                                ? session.promptPreview.slice(0, 28) + "..."
                                : "UNTITLED SESSION"}
                          </p>
                          <p className="text-[10px] text-[#737373] uppercase mt-1 truncate group-hover:text-[#404040] transition-colors">
                            {session.context || session.subject || "GENERAL"}
                          </p>
                        </button>

                        <div className="relative z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity pl-3 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRename(session._id, session.name);
                            }}
                            className="p-1 text-[#737373] hover:text-[#0A0A0A] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(session._id);
                            }}
                            className="p-1 text-[#FF3D00] hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Buttons ───────────────────────────────────────────────────
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
      "bg-transparent px-4 sm:px-6 py-3 sm:py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
      "disabled:opacity-50 disabled:pointer-events-none",
      className,
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
      "bg-transparent px-4 py-3",
      "text-[10px] font-bold tracking-widest text-[#737373] uppercase",
      "hover:text-[#FAFAFA] transition-colors disabled:opacity-50 disabled:pointer-events-none",
      className,
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
      "border border-[#262626] bg-[#0A0A0A] px-4 sm:px-6 py-3 sm:py-4",
      "text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase",
      "transition-all duration-300",
      "hover:bg-[#FAFAFA] hover:text-[#0A0A0A] hover:border-[#FAFAFA]",
      "disabled:opacity-50 disabled:pointer-events-none",
      className,
    )}
  >
    {children}
  </button>
);

// ── Main ──────────────────────────────────────────────────────
export default function Tutor() {
  const {
    mode,
    activeSessionId,
    activeSessionName,
    messages,
    sessions,
    selectedNoteIds,
    availableNotes,
    isSavingNotes,
    isStreaming,
    setMode,
    newConversation,
    loadSessions,
    loadSessionConversation,
    renameSession,
    fetchNotesForTutor,
    loadSessionNotes,
    selectNote,
    clearNotes,
    deleteSession,
    sendMessage,
  } = useConversationStore();

  const [input, setInput] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.all([loadSessions(), fetchNotesForTutor()]);
      } finally {
        if (mounted) setIsBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchNotesForTutor, loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const selectedCountLabel = useMemo(() => {
    const count = selectedNoteIds.length;
    return `${count} NOTE${count === 1 ? "" : "S"} ATTACHED`;
  }, [selectedNoteIds.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    await sendMessage(trimmed);
  };

  const handleOpenSession = async (sessionId: string) => {
    await loadSessionConversation(sessionId);
    await loadSessionNotes(sessionId);
    setHistoryDrawerOpen(false);
  };

  const handleRenameSession = async (sessionId: string, currentName?: string) => {
    const next = window.prompt("Rename this tutor session", currentName || "");
    if (!next || !next.trim()) return;
    await renameSession(sessionId, next.trim());
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Delete this tutor session? This cannot be undone.")) return;
    await deleteSession(sessionId);
  };

  const promptChips = [
    "BREAK DOWN STEP-BY-STEP",
    "GIVE A WORKED EXAMPLE",
    "TEST ME WITH A QUESTION",
  ];

  // Context content — used in both modal and desktop sidebar
  const ContextContent = () => (
    <div className="flex flex-col gap-6">
      <div className="flex border-b border-[#262626]">
        <button
          onClick={() => setMode("explain")}
          className={cn(
            "flex-1 px-4 py-3 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
            mode === "explain" ? "text-[#FAFAFA]" : "text-[#737373] hover:text-[#FAFAFA]",
          )}
        >
          EXPLAIN
          {mode === "explain" && (
            <motion.div
              layoutId="activeMode"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF3D00]"
            />
          )}
        </button>
        <button
          onClick={() => setMode("socratic")}
          className={cn(
            "flex-1 px-4 py-3 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
            mode === "socratic" ? "text-[#FAFAFA]" : "text-[#737373] hover:text-[#FAFAFA]",
          )}
        >
          SOCRATIC
          {mode === "socratic" && (
            <motion.div
              layoutId="activeMode"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF3D00]"
            />
          )}
        </button>
      </div>

      <div>
        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
          NOTES
        </label>
        <SecondaryButton
          onClick={() => {
            setIsNotesModalOpen(true);
            setContextModalOpen(false);
          }}
          className="w-full text-left justify-start"
        >
          <BookOpen className="w-4 h-4 mr-2" /> SELECT NOTES
        </SecondaryButton>
      </div>
    </div>
  );

  return (
    <PageWrapper>
      <RateLimitBanner
        remaining={useRateLimitStore((s) => s.remaining)}
        limit={useRateLimitStore((s) => s.limit)}
        resetTime={useRateLimitStore((s) => s.resetTime)}
        showAddKeyPrompt={true}
      />

      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white">
        {/* NOISE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* ── HERO ── */}
        <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="max-w-7xl mx-auto"
          >
            {/* Row 1: Title + HISTORY button */}
            <div className="flex items-end justify-between mb-4 sm:mb-6">
              <motion.h1
                variants={fadeUp}
                className="text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none"
              >
                TUTOR.
              </motion.h1>

              {/* HISTORY — mobile only, opens right drawer */}
              <motion.button
                variants={fadeUp}
                onClick={() => setHistoryDrawerOpen(true)}
                className="lg:hidden flex items-center gap-2 border border-[#262626] px-4 py-3 text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] hover:border-[#FAFAFA] transition-colors self-center"
              >
                <History className="w-4 h-4" />
                HISTORY
                {sessions.length > 0 && (
                  <span className="bg-[#FF3D00] text-[#0A0A0A] text-[9px] font-black px-1.5 py-0.5 min-w-[18px] text-center">
                    {sessions.length}
                  </span>
                )}
              </motion.button>
            </div>

            {/* Row 2: mode subtitle + CONTEXT + NEW (mobile) */}
            <motion.div
              variants={fadeUp}
              className="flex items-center justify-between gap-4"
            >
              {/* Mode subtitle */}
              <div className="flex items-center gap-4">
                <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase hidden sm:block">
                  {mode === "socratic"
                    ? "GUIDED QUESTIONING MODE"
                    : "DIRECT EXPLANATION MODE"}
                </p>
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase sm:hidden">
                  {mode === "socratic" ? "SOCRATIC" : "EXPLAIN"}
                </p>
              </div>

              {/* CONTEXT + NEW — mobile */}
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  onClick={() => setContextModalOpen(true)}
                  className="flex items-center gap-2 border border-[#262626] px-4 py-3 text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] hover:border-[#FAFAFA] transition-colors"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  CONTEXT
                </button>

                <button
                  onClick={() => {
                    newConversation();
                    setInput("");
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 border border-[#FF3D00] px-4 py-3 text-[10px] font-bold tracking-widest text-[#FF3D00] uppercase hover:bg-[#FF3D00] hover:text-[#0A0A0A] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  NEW
                </button>
              </div>

              {/* Desktop NEW SESSION */}
              <PrimaryButton
                onClick={() => {
                  newConversation();
                  setInput("");
                  inputRef.current?.focus();
                }}
                className="hidden lg:inline-flex"
              >
                <Plus className="w-4 h-4 mr-2" /> NEW SESSION
              </PrimaryButton>
            </motion.div>
          </motion.div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-6 sm:py-10 md:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 lg:gap-16">

            {/* ── DESKTOP SIDEBAR ── */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="hidden lg:flex lg:col-span-4 flex-col gap-12"
            >
              {/* Context */}
              <motion.div variants={fadeUp} className="flex flex-col">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="text-xl font-bold tracking-tighter uppercase">
                    CONTEXT
                  </h2>
                  <div className="h-[1px] flex-1 bg-[#262626]" />
                </div>
                <ContextContent />
              </motion.div>

              {/* History */}
              <motion.div variants={fadeUp} className="flex flex-col">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="text-xl font-bold tracking-tighter uppercase">
                    HISTORY
                  </h2>
                  <div className="h-[1px] flex-1 bg-[#262626]" />
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                    {sessions.length.toString().padStart(2, "0")} ITEMS
                  </span>
                </div>
                <div className="flex flex-col border-t border-[#262626]">
                  {isBooting ? (
                    <div className="h-32 border-b border-[#262626] animate-pulse bg-[#0A0A0A]" />
                  ) : sessions.length === 0 ? (
                    <div className="p-8 border-b border-[#262626] flex flex-col items-center text-center">
                      <h3 className="text-xl font-bold tracking-tighter mb-2">VOID.</h3>
                      <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                        NO HISTORY FOUND.
                      </p>
                    </div>
                  ) : (
                    sessions.map((session) => {
                      const isActive = session._id === activeSessionId;
                      return (
                        <div
                          key={session._id}
                          className="group relative border-b border-[#262626] p-4 cursor-pointer overflow-hidden flex items-center justify-between"
                        >
                          <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                          <div className="relative z-10 flex-1 flex flex-col">
                            <button
                              onClick={() => void handleOpenSession(session._id)}
                              className="text-left w-full"
                            >
                              <p className={cn(
                                "text-sm font-bold tracking-tight uppercase truncate",
                                isActive
                                  ? "text-[#FF3D00]"
                                  : "text-[#FAFAFA] group-hover:text-[#0A0A0A]",
                              )}>
                                {session.name
                                  ? session.name
                                  : session.promptPreview
                                    ? session.promptPreview.slice(0, 30) + "..."
                                    : "UNTITLED SESSION"}
                              </p>
                              <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mt-1 truncate">
                                {session.context || session.subject || "GENERAL"}
                              </p>
                            </button>
                          </div>
                          <div className="relative z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity pl-4">
                            <button
                              onClick={() => void handleRenameSession(session._id, session.name)}
                              className="text-[#737373] hover:text-[#0A0A0A]"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleDeleteSession(session._id)}
                              className="text-[#FF3D00]"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>

            {/* ── CHAT AREA ── */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="col-span-1 lg:col-span-8 flex flex-col border border-[#262626] bg-[#0A0A0A] relative"
              style={{ minHeight: "480px" }}
            >
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#262626] flex-wrap gap-2">
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase px-2 sm:px-3 py-1 border border-[#262626] truncate max-w-[140px] sm:max-w-none">
                    {activeSessionName || "UNSAVED SESSION"}
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase px-2 sm:px-3 py-1 border border-[#FF3D00]">
                    {selectedCountLabel}
                  </span>
                </div>
                {isSavingNotes && (
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase animate-pulse">
                    SYNCING...
                  </span>
                )}
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-[#0A0A0A]"
                style={{ maxHeight: "55vh" }}
              >
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 border border-[#262626] mb-6 flex items-center justify-center">
                      <Bot className="w-6 h-6 sm:w-8 sm:h-8 text-[#FF3D00]" />
                    </div>
                    <h3 className="text-2xl sm:text-4xl font-bold tracking-tighter mb-3 text-[#FAFAFA]">
                      AWAITING INPUT.
                    </h3>
                    <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8 leading-relaxed">
                      ASK A TOPIC, ATTACH NOTES, GET STREAMED ANSWERS.
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2 w-full justify-start sm:justify-center flex-nowrap sm:flex-wrap">
                      {promptChips.map((prompt) => (
                        <SecondaryButton
                          key={prompt}
                          onClick={() => {
                            setInput(prompt);
                            inputRef.current?.focus();
                          }}
                          className="shrink-0 text-[9px] sm:text-[10px] px-3 py-2"
                        >
                          {prompt}
                        </SecondaryButton>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 sm:gap-8 pb-8">
                    <AnimatePresence>
                      {messages.map((message) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className={cn(
                            "flex w-full",
                            message.role === "user" ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[90%] sm:max-w-[85%] lg:max-w-[75%]",
                              message.role === "user" ? "ml-4 sm:ml-8" : "mr-4 sm:mr-8",
                            )}
                          >
                            {message.role === "assistant" && (
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-5 h-5 border border-[#FF3D00] flex items-center justify-center">
                                  <Bot className="w-2.5 h-2.5 text-[#FF3D00]" />
                                </div>
                                <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                                  AI TUTOR
                                </span>
                              </div>
                            )}
                            {message.role === "user" && (
                              <div className="flex items-center justify-end gap-3 mb-3">
                                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                                  USER
                                </span>
                                <div className="w-5 h-5 border border-[#262626] flex items-center justify-center">
                                  <User className="w-2.5 h-2.5 text-[#737373]" />
                                </div>
                              </div>
                            )}

                            <div
                              className={cn(
                                "p-4 sm:p-6",
                                message.role === "user"
                                  ? "bg-[#1A1A1A] border border-[#262626]"
                                  : "bg-transparent border-l-2 border-[#FF3D00] py-2 pl-4 sm:pl-6",
                              )}
                            >
                              <div className="text-xs sm:text-sm font-medium text-[#FAFAFA] leading-relaxed prose prose-invert prose-sm max-w-none">
                                {message.content ? (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                                      strong: ({ children }) => <strong className="font-bold text-[#FF3D00]">{children}</strong>,
                                      code: ({ children, className, ...props }: any) =>
                                        !className ? (
                                          <code className="bg-[#1A1A1A] px-1.5 py-0.5 text-[#FF3D00] font-mono text-xs">{children}</code>
                                        ) : (
                                          <code className="block bg-[#1A1A1A] p-4 my-3 font-mono text-xs overflow-x-auto">{children}</code>
                                        ),
                                      pre: ({ children }) => <pre className="bg-[#1A1A1A] p-3 sm:p-4 my-3 overflow-x-auto border border-[#262626] text-xs">{children}</pre>,
                                      ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                                      ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                                      li: ({ children }) => <li className="text-[#FAFAFA]">{children}</li>,
                                      h1: ({ children }) => <h1 className="text-lg sm:text-xl font-bold tracking-tight mb-3 text-[#FAFAFA]">{children}</h1>,
                                      h2: ({ children }) => <h2 className="text-base sm:text-lg font-bold tracking-tight mb-2 text-[#FAFAFA]">{children}</h2>,
                                      h3: ({ children }) => <h3 className="text-sm sm:text-base font-bold tracking-tight mb-2 text-[#FAFAFA]">{children}</h3>,
                                      blockquote: ({ children }) => <blockquote className="border-l-2 border-[#FF3D00] pl-4 my-3 text-[#737373] italic">{children}</blockquote>,
                                    }}
                                  >
                                    {message.content}
                                  </ReactMarkdown>
                                ) : isStreaming ? "..." : ""}
                              </div>
                            </div>

                            {message.role === "assistant" &&
                              message.followUps?.length &&
                              !isStreaming ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {message.followUps.map((followUp) => (
                                  <button
                                    key={`${message.id}-${followUp}`}
                                    onClick={() => void sendMessage(followUp)}
                                    className="border border-[#262626] px-3 py-1.5 text-[9px] sm:text-[10px] font-bold tracking-[0.1em] text-[#737373] uppercase hover:text-[#FAFAFA] hover:border-[#FAFAFA] transition-colors"
                                  >
                                    {followUp}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {isStreaming && (
                      <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                        <Loader2 className="w-3 h-3 animate-spin" /> STREAMING...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* INPUT — sticky */}
              <div className="sticky bottom-0 p-4 sm:p-6 border-t border-[#262626] bg-[#0A0A0A]">
                <div className="flex items-center gap-3 sm:gap-4">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="ENTER QUERY..."
                    disabled={isStreaming}
                    rows={1}
                    className="w-full bg-transparent border-b border-[#262626] py-2 text-xs sm:text-sm text-[#FAFAFA] placeholder:text-[#737373] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase resize-none min-h-[40px]"
                  />
                  <PrimaryButton
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || isStreaming}
                    className="shrink-0 px-3 sm:px-6"
                  >
                    {isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span className="hidden sm:inline">SEND </span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </PrimaryButton>
                </div>
                <p className="mt-2 text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase hidden sm:block">
                  SHIFT + ENTER FOR NEW LINE
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── HISTORY DRAWER (mobile, slides from right) ── */}
      <HistoryDrawer
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        isBooting={isBooting}
        onOpenSession={handleOpenSession}
        onRename={handleRenameSession}
        onDelete={handleDeleteSession}
      />

      {/* ── CONTEXT MODAL (mobile) ── */}
      <Modal
        open={contextModalOpen}
        onClose={() => setContextModalOpen(false)}
        title="CONTEXT"
      >
        <ContextContent />
      </Modal>

      {/* ── NOTES MODAL ── */}
      <Modal
        open={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        title="SELECT NOTES"
      >
        <div className="flex items-center gap-4 mb-6">
          <GhostButton
            onClick={() => void clearNotes()}
            disabled={isSavingNotes || selectedNoteIds.length === 0}
            className="px-0 py-0 text-[#737373] hover:text-[#FF3D00]"
          >
            CLEAR SELECTED
          </GhostButton>
        </div>
        <div className="flex flex-col border-t border-[#262626] max-h-[50vh] sm:max-h-[300px] overflow-y-auto">
          {isBooting ? (
            <div className="h-32 border-b border-[#262626] animate-pulse bg-[#0A0A0A]" />
          ) : availableNotes.length === 0 ? (
            <div className="p-8 border-b border-[#262626] flex flex-col items-center text-center">
              <h3 className="text-xl font-bold tracking-tighter mb-2">VOID.</h3>
              <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                NO NOTES AVAILABLE.
              </p>
            </div>
          ) : (
            availableNotes.map((note) => {
              const selected = selectedNoteIds.includes(note._id);
              return (
                <button
                  key={note._id}
                  onClick={() => void selectNote(note._id)}
                  className="group relative border-b border-[#262626] flex items-center p-4 overflow-hidden text-left"
                >
                  <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                  <div className="relative z-10 flex-1 flex items-center gap-4">
                    <div
                      className={cn(
                        "w-4 h-4 border flex items-center justify-center shrink-0",
                        selected
                          ? "bg-[#FF3D00] border-[#FF3D00] text-[#FAFAFA]"
                          : "border-[#737373] group-hover:border-[#0A0A0A]",
                      )}
                    >
                      {selected && <Check className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-xs font-bold tracking-[0.1em] uppercase truncate",
                        selected ? "text-[#FF3D00]" : "text-[#FAFAFA] group-hover:text-[#0A0A0A]",
                      )}>
                        {note.title}
                      </p>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mt-1 truncate">
                        {note.subject || "GENERAL"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Modal>
    </PageWrapper>
  );
}