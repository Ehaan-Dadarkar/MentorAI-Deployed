import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  BookOpen,
  Check,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Send,
  Trash2,
  User,
  ArrowRight,
  Plus,
  X
} from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { cn } from "@/lib/utils";
import { useConversationStore } from "@/store/conversationStore";

// ── Animation Config ─────────────────────
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
    transition: { duration: 0.6, ease: easing },
  },
};

// ── Modal Component ─────────────────────
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
          className="fixed inset-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-md flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-2xl border border-[#262626] bg-[#0A0A0A] p-8 relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Noise texture */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />

            <div className="relative z-10 flex items-center justify-between mb-8 border-b border-[#262626] pb-4">
              <h2 className="text-2xl font-bold tracking-tighter uppercase">{title}</h2>
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

// ── Button Components ─────────────────────
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

export default function Tutor() {
  const {
    context,
    mode,
    activeSessionId,
    activeSessionName,
    messages,
    sessions,
    selectedNoteIds,
    availableNotes,
    isSavingNotes,
    isStreaming,
    setContext,
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

    return () => {
      mounted = false;
    };
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
  };

  const handleRenameSession = async (sessionId: string, currentName?: string) => {
    const next = window.prompt("Rename this tutor session", currentName || "");
    if (!next || !next.trim()) return;
    await renameSession(sessionId, next.trim());
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Delete this tutor session? This cannot be undone.")) {
      return;
    }
    await deleteSession(sessionId);
  };

  const promptChips = [
    "BREAK DOWN THIS CONCEPT STEP-BY-STEP",
    "GIVE ME A WORKED EXAMPLE",
    "TEST ME WITH ONE CHALLENGE QUESTION",
  ];

  return (
    <PageWrapper>
      <RateLimitBanner
        remaining={useRateLimitStore((s) => s.remaining)}
        limit={useRateLimitStore((s) => s.limit)}
        resetTime={useRateLimitStore((s) => s.resetTime)}
        showAddKeyPrompt={true}
      />
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-32">
        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-50"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

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
                TUTOR.
              </motion.h1>
              <motion.div
                variants={fadeUp}
                className="mt-6 flex items-center gap-6"
              >
                <div className="h-1 w-12 bg-[#FF3D00]" />
                <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  {mode === "socratic"
                    ? "GUIDED QUESTIONING MODE"
                    : "DIRECT EXPLANATION MODE"}
                </p>
              </motion.div>
            </div>

            <motion.div variants={fadeUp} className="flex flex-col gap-4 min-w-[200px]">
              <PrimaryButton
                onClick={() => {
                  newConversation();
                  setInput("");
                  inputRef.current?.focus();
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> NEW SESSION
              </PrimaryButton>
            </motion.div>
          </motion.div>
        </div>

        {/* MAIN CONTENT */}
        <div className="max-w-7xl mx-auto px-8 md:px-16 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            
            {/* LEFT SIDEBAR - 4 cols */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="lg:col-span-4 flex flex-col gap-12"
            >
              {/* SETTINGS / CONTEXT */}
              <motion.div variants={fadeUp} className="flex flex-col">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="text-xl font-bold tracking-tighter uppercase">
                    CONTEXT
                  </h2>
                  <div className="h-[1px] flex-1 bg-[#262626]" />
                </div>

                {/* Tabs for mode */}
                <div className="flex border-b border-[#262626] mb-6">
                  <button
                    onClick={() => setMode("explain")}
                    className={cn(
                      "flex-1 px-4 py-3 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative",
                      mode === "explain"
                        ? "text-[#FAFAFA]"
                        : "text-[#737373] hover:text-[#FAFAFA]"
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
                      mode === "socratic"
                        ? "text-[#FAFAFA]"
                        : "text-[#737373] hover:text-[#FAFAFA]"
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
                    onClick={() => setIsNotesModalOpen(true)}
                    className="w-full text-left justify-start"
                  >
                    <BookOpen className="w-4 h-4 mr-2" /> SELECT NOTES
                  </SecondaryButton>
                </div>
              </motion.div>

              {/* SESSIONS LIST */}
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
                      <h3 className="text-xl font-bold tracking-tighter mb-2 text-[#FAFAFA]">
                        VOID.
                      </h3>
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

                          <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                            <button
                              onClick={() => void handleOpenSession(session._id)}
                              className="text-left w-full"
                            >
                              <p
                                className={cn(
                                  "text-sm font-bold tracking-tight uppercase truncate",
                                  isActive
                                    ? "text-[#FF3D00]"
                                    : "text-[#FAFAFA] group-hover:text-[#0A0A0A]"
                                )}
                              >
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

                          <div className="relative z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pl-4">
                            <button
                              onClick={() => void handleRenameSession(session._id, session.name)}
                              className="text-[#737373] hover:text-[#0A0A0A] transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleDeleteSession(session._id)}
                              className="text-[#FF3D00] transition-colors"
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

            {/* RIGHT MAIN CHAT - 8 cols */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="lg:col-span-8 flex flex-col min-h-[600px] border border-[#262626] bg-[#0A0A0A] relative max-h-[80vh]"
            >
              {/* CHAT HEADER */}
              <div className="flex items-center justify-between p-6 border-b border-[#262626]">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase px-3 py-1 border border-[#262626]">
                    {activeSessionName || "UNSAVED SESSION"}
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase px-3 py-1 border border-[#FF3D00]">
                    {selectedCountLabel}
                  </span>
                </div>
                {isSavingNotes && (
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase animate-pulse">
                    SYNCING...
                  </span>
                )}
              </div>

              {/* MESSAGES AREA */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-[#0A0A0A]">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                    <div className="w-16 h-16 border border-[#262626] mb-8 flex items-center justify-center">
                      <Bot className="w-8 h-8 text-[#FF3D00]" />
                    </div>
                    <h3 className="text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
                      AWAITING INPUT.
                    </h3>
                    <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-12 leading-relaxed">
                      ASK A TOPIC, ATTACH NOTES, THEN GET STREAMED ANSWERS WITH
                      GUIDED FOLLOW-UP PROMPTS.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                      {promptChips.map((prompt) => (
                        <SecondaryButton
                          key={prompt}
                          onClick={() => {
                            setInput(prompt);
                            inputRef.current?.focus();
                          }}
                        >
                          {prompt}
                        </SecondaryButton>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-8 pb-12">
                    <AnimatePresence>
                      {messages.map((message) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className={cn(
                            "flex w-full",
                            message.role === "user" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[85%] lg:max-w-[75%]",
                              message.role === "user" ? "ml-8" : "mr-8"
                            )}
                          >
                            {message.role === "assistant" && (
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-6 h-6 border border-[#FF3D00] flex items-center justify-center">
                                  <Bot className="w-3 h-3 text-[#FF3D00]" />
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
                                <div className="w-6 h-6 border border-[#262626] flex items-center justify-center">
                                  <User className="w-3 h-3 text-[#737373]" />
                                </div>
                              </div>
                            )}

                            <div
                              className={cn(
                                "p-6",
                                message.role === "user"
                                  ? "bg-[#1A1A1A] border border-[#262626]"
                                  : "bg-transparent border-l-2 border-[#FF3D00] py-2 pl-6"
                              )}
                            >
                              <div className="text-sm font-medium text-[#FAFAFA] leading-relaxed prose prose-invert prose-sm max-w-none">
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
                                      pre: ({ children }) => <pre className="bg-[#1A1A1A] p-4 my-3 overflow-x-auto border border-[#262626]">{children}</pre>,
                                      ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                                      ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                                      li: ({ children }) => <li className="text-[#FAFAFA]">{children}</li>,
                                      h1: ({ children }) => <h1 className="text-xl font-bold tracking-tight mb-3 text-[#FAFAFA]">{children}</h1>,
                                      h2: ({ children }) => <h2 className="text-lg font-bold tracking-tight mb-2 text-[#FAFAFA]">{children}</h2>,
                                      h3: ({ children }) => <h3 className="text-base font-bold tracking-tight mb-2 text-[#FAFAFA]">{children}</h3>,
                                      blockquote: ({ children }) => <blockquote className="border-l-2 border-[#FF3D00] pl-4 my-3 text-[#737373] italic">{children}</blockquote>,
                                    }}
                                  >
                                    {message.content}
                                  </ReactMarkdown>
                                ) : isStreaming ? (
                                  "..."
                                ) : (
                                  ""
                                )}
                              </div>
                            </div>

                            {message.role === "assistant" &&
                              message.followUps?.length &&
                              !isStreaming ? (
                              <div className="mt-6 flex flex-wrap gap-2">
                                {message.followUps.map((followUp) => (
                                  <button
                                    key={`${message.id}-${followUp}`}
                                    onClick={() => void sendMessage(followUp)}
                                    className="border border-[#262626] px-4 py-2 text-[10px] font-bold tracking-[0.1em] text-[#737373] uppercase hover:text-[#FAFAFA] hover:border-[#FAFAFA] transition-colors"
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
                        <Loader2 className="w-3 h-3 animate-spin" /> STREAMING
                        RESPONSE...
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* INPUT AREA */}
              <div className="p-6 border-t border-[#262626] bg-[#0A0A0A]">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
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
                      placeholder="ENTER QUERY HERE..."
                      disabled={isStreaming}
                      rows={1}
                      className="w-full bg-transparent border-b border-[#262626] py-2 text-sm text-[#FAFAFA] placeholder:text-[#737373] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase resize-none min-h-[40px] flex-1"
                    />
                    <PrimaryButton
                      onClick={() => void handleSend()}
                      disabled={!input.trim() || isStreaming}
                      className="shrink-0"
                    >
                      {isStreaming ? (
                        <Loader2 className="w-4 h-4 animate-spin ml-1" />
                      ) : (
                        <>
                          SEND <Send className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </PrimaryButton>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                    <span>SHIFT + ENTER FOR NEW LINE</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <Modal open={isNotesModalOpen} onClose={() => setIsNotesModalOpen(false)} title="SELECT NOTES">
        <div className="flex items-center gap-4 mb-6">
          <GhostButton
            onClick={() => void clearNotes()}
            disabled={isSavingNotes || selectedNoteIds.length === 0}
            className="px-0 py-0 text-[#737373] hover:text-[#FF3D00]"
          >
            CLEAR SELECTED
          </GhostButton>
        </div>

        <div className="flex flex-col border-t border-[#262626] max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {isBooting ? (
            <div className="h-32 border-b border-[#262626] animate-pulse bg-[#0A0A0A]" />
          ) : availableNotes.length === 0 ? (
            <div className="p-8 border-b border-[#262626] flex flex-col items-center text-center">
              <h3 className="text-xl font-bold tracking-tighter mb-2 text-[#FAFAFA]">
                VOID.
              </h3>
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
                  className="group relative border-b border-[#262626] flex items-center p-4 overflow-hidden text-left transition-colors"
                >
                  <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />

                  <div className="relative z-10 flex-1 flex items-center gap-4 transition-colors duration-500 group-hover:text-[#0A0A0A]">
                    <div
                      className={cn(
                        "w-4 h-4 border flex items-center justify-center transition-colors shrink-0",
                        selected
                          ? "bg-[#FF3D00] border-[#FF3D00] text-[#FAFAFA]"
                          : "border-[#737373] group-hover:border-[#0A0A0A]"
                      )}
                    >
                      {selected && <Check className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs font-bold tracking-[0.1em] uppercase truncate",
                          selected
                            ? "text-[#FF3D00]"
                            : "text-[#FAFAFA] group-hover:text-[#0A0A0A]"
                        )}
                      >
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

