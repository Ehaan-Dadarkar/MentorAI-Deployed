import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { ArrowRight, X, Play, Plus } from "lucide-react";
import api from "@/lib/axios";
import type { Note } from "@/types";
import { useNavigate } from "react-router-dom";
import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { useFlashcardStore } from "@/store/flashcardStore";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Shared Animation Config ─────────────────────────────────

const easing = [0.25, 0, 0, 1] as const;

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

// ── UI Primitives ───────────────────────────────────────────

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
      "group relative inline-flex items-center gap-2 overflow-hidden bg-transparent px-6 py-4 text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase disabled:opacity-50 disabled:pointer-events-none rounded-none shadow-none",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{
        initial: { scaleX: 0, originX: 0 },
        hover: { scaleX: 1, originX: 0 },
      }}
      transition={{ duration: 0.4, ease: easing }}
      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#FF3D00]"
    />
    <motion.div
      variants={{
        initial: { scaleX: 1, originX: 1 },
        hover: { scaleX: 0, originX: 1 },
      }}
      transition={{ duration: 0.4, ease: easing }}
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
    whileHover={disabled ? "initial" : "hover"}
    initial="initial"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden bg-transparent px-4 py-3 text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] transition-colors rounded-none shadow-none disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{
        initial: { scaleX: 0, originX: 0 },
        hover: { scaleX: 1, originX: 0 },
      }}
      transition={{ duration: 0.4, ease: easing }}
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
      "disabled:opacity-50 disabled:pointer-events-none rounded-none shadow-none",
      className
    )}
  >
    {children}
  </button>
);

// ── Modal Wrapper ───────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function Modal({ open, onClose, children, title }: ModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-md flex items-center justify-center p-4 rounded-none shadow-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-2xl border border-[#262626] bg-[#0A0A0A] p-8 relative overflow-hidden rounded-none shadow-none"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* NOISE TEXTURE */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />

            <div className="relative z-10 flex items-center justify-between mb-8 border-b border-[#262626] pb-4">
              <h3 className="text-sm font-bold tracking-[0.2em] text-[#FAFAFA] uppercase">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-[#737373] hover:text-[#FAFAFA] transition-colors rounded-none shadow-none"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative z-10">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function Flashcards() {
  const navigate = useNavigate();
  const remaining = useRateLimitStore((s) => s.remaining);
  const limit = useRateLimitStore((s) => s.limit);
  const resetTime = useRateLimitStore((s) => s.resetTime);
  const {
    decks,
    dueCards,
    notesForGeneration,
    isLoading,
    isGenerating,
    fetchDecks,
    fetchDueCards,
    fetchNotesForGeneration,
    deleteDeck,
    createDeck,
    loadDeck,
    startSession,
    generateCards,
  } = useFlashcardStore();

  const [showGenerate, setShowGenerate] = useState(false);
  const [showCreateDeck, setShowCreateDeck] = useState(false);

  // Generate modal state
  const [tab, setTab] = useState<"paste" | "notes">("paste");
  const [inputText, setInputText] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [generatedPreview, setGeneratedPreview] = useState<
    { question: string; answer: string; difficulty?: string }[]
  >([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create deck state
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckSubject, setNewDeckSubject] = useState("");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);

  useEffect(() => {
    fetchDecks();
    fetchDueCards();
  }, [fetchDecks, fetchDueCards]);

  useEffect(() => {
    if (showGenerate) {
      fetchNotesForGeneration();
    }
  }, [showGenerate, fetchNotesForGeneration]);

  const closeGenerateModal = async () => {
    setShowGenerate(false);
    setTab("paste");
    setInputText("");
    setSubject("");
    setSelectedNoteId("");
    setSelectedDeckId("");
    setGeneratedPreview([]);
    setIsSuccess(false);
    setError(null);
    await fetchDecks();
  };

  const closeCreateDeckModal = () => {
    setShowCreateDeck(false);
    setNewDeckName("");
    setNewDeckSubject("");
    setError(null);
  };

  const handleDeleteDeck = async (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDeck(deckId);
    await fetchDecks();
  };

  const handleOpenDeck = async (deckId: string) => {
    await loadDeck(deckId);
    navigate(`/flashcards/${deckId}`);
  };

  const handleReviewNow = () => {
    if (!dueCards.length) return;
    startSession(dueCards);
    navigate("/flashcards/due/study");
  };

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      setError("DECK NAME REQUIRED.");
      return;
    }
    setError(null);
    setIsCreatingDeck(true);
    try {
      await createDeck(newDeckName.trim(), newDeckSubject.trim() || "General");
      closeCreateDeckModal();
      await fetchDecks();
    } catch {
      setError("CREATION FAILED.");
    } finally {
      setIsCreatingDeck(false);
    }
  };

  const handleGenerate = async () => {
    setError(null);

    let text = "";
    if (tab === "paste") {
      text = inputText.trim();
    } else {
      if (!selectedNoteId) {
        setError("SELECT A NOTE FIRST.");
        return;
      }
      try {
        const { data } = await api.get(`/notes/${selectedNoteId}`);
        text = stripHtml(data.note?.content || "");
      } catch {
        setError("FAILED TO LOAD NOTE.");
        return;
      }
    }

    if (text.length < 10) {
      setError("INSUFFICIENT STUDY TEXT.");
      return;
    }

    try {
      const result = await generateCards(
        text,
        subject.trim() || "General",
        selectedDeckId || undefined,
      );
      setGeneratedPreview(result.cards);
      setIsSuccess(true);
      await fetchDecks();
    } catch {
      setError("GENERATION FAILED.");
    }
  };

  return (
    <PageWrapper>
      <RateLimitBanner
        remaining={remaining}
        limit={limit}
        resetTime={resetTime}
        showAddKeyPrompt={true}
      />
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-32 font-sans rounded-none shadow-none">
        
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
                FLASHCARD.
              </motion.h1>
              <motion.div 
                variants={fadeUp}
                className="mt-6 flex items-center gap-6"
              >
                <div className="h-1 w-12 bg-[#FF3D00]" />
                <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  ACTIVE RECALL INVENTORY
                </p>
              </motion.div>
            </div>
            
            <motion.div variants={fadeUp} className="flex flex-col gap-4 min-w-[200px]">
              <PrimaryButton onClick={() => setShowGenerate(true)}>
                GENERATE CARDS <ArrowRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
              <GhostButton onClick={() => navigate("/flashcards/stats")}>
                VIEW ANALYTICS
              </GhostButton>
            </motion.div>
          </motion.div>
        </div>

        {/* DUE CARDS BANNER */}
        {dueCards.length > 0 && (
          <div className="border-b border-[#262626] bg-[#0A0A0A]">
            <div className="max-w-7xl mx-auto px-8 md:px-16 py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="text-[#FF3D00] text-5xl font-bold tracking-tighter">
                  {dueCards.length.toString().padStart(2, "0")}
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-[#FAFAFA] uppercase">
                    CARDS DUE TODAY
                  </h3>
                  <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase mt-1">
                    MAINTAIN SYNAPTIC STREAK
                  </p>
                </div>
              </div>
              <button 
                onClick={handleReviewNow}
                className="group flex items-center gap-4 text-[#FAFAFA] hover:text-[#FF3D00] transition-colors rounded-none outline-none shadow-none bg-transparent"
              >
                <span className="text-sm font-bold tracking-[0.2em] uppercase">INITIATE REVIEW</span>
                <div className="w-12 h-12 border border-[#262626] group-hover:border-[#FF3D00] rounded-none flex items-center justify-center transition-colors">
                  <Play className="w-4 h-4 translate-x-[1px]" />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* DECKS GRID */}
        <div className="max-w-7xl mx-auto px-8 md:px-16 py-16">
          <div className="flex items-center gap-4 mb-12">
            <h2 className="text-3xl font-bold tracking-tighter uppercase">DECKS DOMAIN</h2>
            <div className="h-[1px] flex-1 bg-[#262626]" />
            <GhostButton onClick={() => setShowCreateDeck(true)} className="px-0 py-0 text-xs">
              <Plus className="w-3 h-3" /> CREATE DECK
            </GhostButton>
            <div className="h-[1px] w-8 bg-[#262626]" />
            <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
              {decks.length.toString().padStart(2, "0")} TOTAL
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-64 border-b border-r border-[#262626] bg-[#0A0A0A] animate-pulse"
                />
              ))}
            </div>
          ) : decks.length === 0 ? (
            <div className="border border-[#262626] p-16 flex flex-col items-center text-center rounded-none shadow-none">
              <h3 className="text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">VOID.</h3>
              <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
                NO DECKS ESTABLISHED YET.
              </p>
              <PrimaryButton onClick={() => setShowCreateDeck(true)}>
                CREATE INITIAL DECK <ArrowRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
            </div>
          ) : (
            <motion.div 
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]"
            >
              {decks.map((deck) => (
                <motion.div
                  key={deck._id}
                  variants={fadeUp}
                  className="group relative border-b border-r border-[#262626] p-8 cursor-pointer overflow-hidden flex flex-col min-h-[300px] bg-[#0A0A0A] rounded-none shadow-none"
                  onClick={() => void handleOpenDeck(deck._id)}
                >
                  <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                  
                  <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737373] group-hover:text-[#0A0A0A]/60">
                        {deck.subject || "GENERAL"}
                      </span>
                      <button
                        onClick={(e) => handleDeleteDeck(deck._id, e)}
                        className="text-[#737373] hover:text-[#FF3D00] group-hover:text-[#0A0A0A]/40 group-hover:hover:text-[#FF3D00] transition-colors bg-transparent border-none rounded-none shadow-none p-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <h3 className="text-2xl font-bold tracking-tighter leading-tight mb-auto uppercase">
                      {deck.name}
                    </h3>

                    <div className="mt-8 flex items-end justify-end">
                      <div className="text-[#FF3D00] font-bold text-sm tracking-[0.2em] flex items-center">
                        ACCESS <ArrowRight className="w-4 h-4 inline-block ml-1 -translate-y-[1px]" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* ── Create Deck Modal ──────────────────────────────── */}
        <Modal
          open={showCreateDeck}
          onClose={closeCreateDeckModal}
          title="INITIALIZE NEW DECK"
        >
          <div className="space-y-8">
            <div>
              <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                DECK NOMENCLATURE
              </label>
              <input
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="E.G. ADVANCED THERMODYNAMICS"
                className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase rounded-none shadow-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                CLASSIFICATION SUBJECT
              </label>
              <input
                value={newDeckSubject}
                onChange={(e) => setNewDeckSubject(e.target.value)}
                placeholder="E.G. PHYSICS"
                className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase rounded-none shadow-none"
              />
            </div>

            {error && (
              <p className="text-xs font-bold tracking-[0.2em] text-[#FF3D00] uppercase pt-2">
                ERROR: {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-4 pt-6 mt-6 border-t border-[#262626]">
              <GhostButton onClick={closeCreateDeckModal} disabled={isCreatingDeck}>
                CANCEL
              </GhostButton>
              <PrimaryButton onClick={handleCreateDeck} disabled={isCreatingDeck}>
                {isCreatingDeck ? "INITIALIZING..." : "CONFIRM CREATION"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>

        {/* ── Generate Modal ─────────────────────────────────── */}
        <Modal
          open={showGenerate}
          onClose={() => void closeGenerateModal()}
          title="SYNTHESIZE FLASHCARDS"
        >
          {isSuccess ? (
            <div className="space-y-8">
              <div className="border border-[#FF3D00] p-6 bg-[#FF3D00]/5 rounded-none shadow-none">
                <p className="text-lg font-bold tracking-tight text-[#FF3D00] uppercase mb-2">
                  {generatedPreview.length} CARDS GENERATED
                </p>
                <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                  INTEGRATED INTO DATASTORE.
                </p>
              </div>

              <div className="max-h-[50vh] overflow-y-auto pr-4 space-y-4 custom-scrollbar">
                {generatedPreview.map((card, idx) => (
                  <div
                    key={idx}
                    className="border border-[#262626] p-6 rounded-none shadow-none"
                  >
                    <div className="mb-4">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] mb-2 uppercase">QUERY</p>
                      <p className="text-sm text-[#FAFAFA] leading-relaxed">{card.question}</p>
                    </div>
                    <div className="h-[1px] w-full bg-[#262626] mb-4" />
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] mb-2 uppercase">ANSWER</p>
                      <p className="text-sm text-[#737373] leading-relaxed">{card.answer}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end border-t border-[#262626] pt-6">
                <PrimaryButton
                  onClick={() => void closeGenerateModal()}
                >
                  ACKNOWLEDGE
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Tabs */}
              <div className="flex border-b border-[#262626]">
                <button
                  onClick={() => setTab("paste")}
                  className={cn(
                    "px-6 py-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors relative bg-transparent border-none rounded-none shadow-none",
                    tab === "paste"
                      ? "text-[#FAFAFA]"
                      : "text-[#737373] hover:text-[#FAFAFA]"
                  )}
                >
                  RAW TEXT
                  {tab === "paste" && (
                    <motion.div layoutId="genTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF3D00]" />
                  )}
                </button>
                <button
                  onClick={() => setTab("notes")}
                  className={cn(
                    "px-6 py-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors relative bg-transparent border-none rounded-none shadow-none",
                    tab === "notes"
                      ? "text-[#FAFAFA]"
                      : "text-[#737373] hover:text-[#FAFAFA]"
                  )}
                >
                  FROM ARCHIVES
                  {tab === "notes" && (
                    <motion.div layoutId="genTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF3D00]" />
                  )}
                </button>
              </div>

              {tab === "paste" ? (
                <div>
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                    SOURCE MATERIAL
                  </label>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="PASTE VERBATIM LECTURE, TEXTBOOK, OR TRANSCRIPT FRAGMENTS..."
                    className="w-full min-h-[200px] bg-transparent border border-[#262626] p-4 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors resize-y rounded-none shadow-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                    SELECT ARCHIVED NOTE
                  </label>
                  <div className="max-h-[300px] overflow-y-auto border border-[#262626] rounded-none shadow-none custom-scrollbar">
                    {notesForGeneration.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">NO ARCHIVES DEDUCED.</p>
                      </div>
                    ) : (
                      notesForGeneration.map((note: Note) => (
                        <button
                          key={note._id}
                          onClick={() => setSelectedNoteId(note._id)}
                          className={cn(
                            "w-full text-left p-4 border-b border-[#262626] last:border-0 transition-colors bg-transparent border-none rounded-none shadow-none block",
                            selectedNoteId === note._id
                              ? "bg-[#FAFAFA] text-[#0A0A0A]"
                              : "hover:bg-[#262626]"
                          )}
                        >
                          <p className={cn("text-sm font-bold uppercase", selectedNoteId === note._id ? "text-[#0A0A0A]" : "text-[#FAFAFA]")}>{note.title}</p>
                          <p className={cn("text-[10px] font-bold tracking-[0.2em] uppercase mt-2", selectedNoteId === note._id ? "text-[#0A0A0A]/60" : "text-[#737373]")}>
                            {note.subject || "GENERAL"}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                    CLASSIFICATION
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="E.G. QUANTUM MECHANICS"
                    className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase rounded-none shadow-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                    DESTINATION DECK
                  </label>
                  <select
                    value={selectedDeckId}
                    onChange={(e) => setSelectedDeckId(e.target.value)}
                    className="w-full bg-[#0A0A0A] border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase cursor-pointer appearance-none rounded-none shadow-none"
                  >
                    <option value="">+ INITIALIZE NEW DECK</option>
                    {decks.map((deck) => (
                      <option key={deck._id} value={deck._id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <p className="text-xs font-bold tracking-[0.2em] text-[#FF3D00] uppercase pt-2">
                  ERROR: {error}
                </p>
              )}

              <div className="flex justify-end pt-6 mt-6 border-t border-[#262626]">
                <PrimaryButton onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? "SYNTHESIZING..." : "COMMENCE GENERATION"}
                </PrimaryButton>
              </div>
            </div>
          )}
        </Modal>

      </div>
    </PageWrapper>
  );
}