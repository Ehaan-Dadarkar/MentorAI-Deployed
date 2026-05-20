import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Plus, X, ArrowRight } from "lucide-react";
import { useFlashcardStore } from "@/store/flashcardStore";
import { cn } from "@/lib/utils";
import { PageWrapper } from "@/components/layout/PageWrapper";

// ── Shared Animation Config ─────────────────────────────────

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
      "group relative inline-flex items-center gap-2 overflow-hidden",
      // ↓ responsive padding (was px-6 py-4 fixed)
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

// ── Modal Wrapper ───────────────────────────────────────────
// ↓ Bottom-sheet on mobile → centered dialog on sm+

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
          // ↓ items-end on mobile (bottom sheet), items-center on sm+
          className="fixed inset-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            // ↓ rounded top corners on mobile only, full-width bottom sheet → constrained dialog
            className="w-full sm:max-w-2xl border border-[#262626] bg-[#0A0A0A] p-5 sm:p-8 relative overflow-hidden rounded-t-2xl sm:rounded-none max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ↓ Drag handle — only visible on mobile */}
            <div className="sm:hidden w-10 h-1 bg-[#262626] rounded-full mx-auto mb-4" />

            {/* NOISE TEXTURE */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />

            <div className="relative z-10 flex items-center justify-between mb-6 sm:mb-8 border-b border-[#262626] pb-4">
              <h3 className="text-sm font-bold tracking-[0.2em] text-[#FAFAFA] uppercase">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-[#737373] hover:text-[#FAFAFA] transition-colors"
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

// ── Add Card Modal ──────────────────────────────────────────

function AddCardModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (question: string, answer: string, difficulty: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [difficulty, setDifficulty] = useState("medium");

  const handleSave = () => {
    if (!question.trim() || !answer.trim()) return;
    void onSubmit(question, answer, difficulty).then(() => {
      setQuestion("");
      setAnswer("");
      setDifficulty("medium");
      onClose();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="NEW ENTITY INJECTION">
      <div className="space-y-6 sm:space-y-8">
        <div>
          <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
            QUERY SEQUENCE
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="INPUT FRONTAL PROMPT..."
            // ↓ slightly smaller min-h on mobile
            className="w-full min-h-[80px] bg-transparent border border-[#262626] p-3 sm:p-4 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors resize-y"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
            SOLUTION DATA
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="INPUT REVERSE REVELATION..."
            // ↓ shorter on mobile, full height on sm+
            className="w-full min-h-[120px] sm:min-h-[160px] bg-transparent border border-[#262626] p-3 sm:p-4 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors resize-y"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
            DIFFICULTY PROTOCOL
          </label>
          {/* ↓ flex-wrap so buttons don't overflow on very small screens */}
          <div className="flex flex-wrap gap-2 sm:gap-4">
            {["easy", "medium", "hard"].map((level) => (
              <button
                key={level}
                onClick={() => setDifficulty(level)}
                className={cn(
                  // ↓ flex-1 so they share space, responsive padding
                  "flex-1 border px-4 sm:px-6 py-3 sm:py-4 text-[10px] font-bold tracking-widest uppercase transition-colors",
                  difficulty === level
                    ? "border-[#FAFAFA] text-[#0A0A0A] bg-[#FAFAFA]"
                    : "border-[#262626] text-[#737373] hover:border-[#FAFAFA] hover:text-[#FAFAFA] bg-transparent"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 border-t border-[#262626] pt-4 sm:pt-6">
          <GhostButton onClick={onClose}>CANCEL</GhostButton>
          <PrimaryButton
            onClick={handleSave}
            disabled={!question.trim() || !answer.trim()}
          >
            INITIALIZE <ArrowRight className="w-4 h-4 ml-1" />
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function FlashcardDeckDetail() {
  const navigate = useNavigate();
  const { deckId = "" } = useParams();
  const {
    currentDeck,
    cards,
    weakCards,
    isLoading,
    loadDeck,
    fetchDecks,
    fetchWeakCards,
    startSession,
    addCard,
  } = useFlashcardStore();

  const [showAddCard, setShowAddCard] = useState(false);

  useEffect(() => {
    if (!deckId) return;
    void loadDeck(deckId);
    void fetchWeakCards(deckId);
  }, [deckId, loadDeck, fetchWeakCards]);

  const stats = useMemo(() => {
    const totalCards = cards.length;
    const dueToday = cards.filter(
      (card) => new Date(card.nextReview) <= new Date()
    ).length;
    const mastered = cards.filter((card) => card.mastery >= 80).length;
    return { totalCards, dueToday, mastered };
  }, [cards]);

  const startDeckSession = (focused = false) => {
    const source = focused ? weakCards : cards;
    startSession(source);
    navigate(`/flashcards/${deckId}/study`);
  };

  const handleAddCard = async (
    question: string,
    answer: string,
    difficulty: string
  ) => {
    await addCard(deckId, question.trim(), answer.trim(), difficulty);
    await fetchDecks();
    await loadDeck(deckId);
    await fetchWeakCards(deckId);
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

        {/* ── HERO SECTION ── */}
        {/* ↓ Responsive top/bottom padding and horizontal padding */}
        <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            // ↓ stacks on mobile, side-by-side from md
            className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-12"
          >
            <div>
              {/* ↓ tighter margin on mobile */}
              <motion.div variants={fadeUp} className="mb-4 sm:mb-8">
                <GhostButton
                  onClick={() => navigate("/flashcards")}
                  className="px-0"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  RETURN TO DECKS
                </GhostButton>
              </motion.div>

              {/* ↓ starts at text-4xl mobile → scales up */}
              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-6xl md:text-8xl lg:text-[8rem] font-bold tracking-tighter leading-none uppercase mix-blend-difference break-words max-w-4xl"
              >
                {currentDeck?.name || "LOADING."}
              </motion.h1>

              <motion.div
                variants={fadeUp}
                // ↓ tighter gap on mobile
                className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6"
              >
                <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  {currentDeck?.subject || "GENERAL SUBJECT"}
                </p>
              </motion.div>
            </div>

            {/* ↓ row on mobile, column from sm; flex-1 buttons fill available space on mobile */}
            <motion.div
              variants={fadeUp}
              className="flex flex-row sm:flex-col gap-3 sm:gap-4 sm:min-w-[200px] shrink-0"
            >
              <PrimaryButton
                onClick={() => startDeckSession(false)}
                disabled={cards.length === 0}
                className="flex-1 sm:flex-none justify-center sm:justify-start"
              >
                <span className="hidden sm:inline">START RECALL</span>
                <span className="sm:hidden">RECALL</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
              <GhostButton
                onClick={() => setShowAddCard(true)}
                className="flex-1 sm:flex-none justify-center sm:justify-start"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">CREATE CARD</span>
                <span className="sm:hidden">ADD</span>
              </GhostButton>
            </motion.div>
          </motion.div>
        </div>

        {/* ── STATS ROW ── */}
        <div className="border-b border-[#262626] bg-[#0A0A0A]">
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 divide-x divide-y md:divide-y-0 divide-[#262626]">
            <div className="p-5 sm:p-8 md:p-12 flex flex-col justify-between">
              {/* ↓ tighter bottom margin on mobile */}
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 sm:mb-8">
                TOTAL VOLUME
              </p>
              {/* ↓ number scales from text-4xl up */}
              <p className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-[#FAFAFA] leading-none">
                {stats.totalCards}
              </p>
            </div>
            <div className="p-5 sm:p-8 md:p-12 flex flex-col justify-between">
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase mb-4 sm:mb-8">
                DUE TODAY
              </p>
              <p className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-[#FF3D00] leading-none">
                {stats.dueToday}
              </p>
            </div>
            {/* ↓ col-span-2 on mobile (fills row), 1 col from md */}
            <div className="p-5 sm:p-8 md:p-12 flex flex-col justify-between col-span-2 md:col-span-1 border-t md:border-t-0 border-[#262626]">
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 sm:mb-8">
                MASTERED
              </p>
              <p className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-[#FAFAFA] leading-none">
                {stats.mastered}
              </p>
            </div>
          </div>
        </div>

        {/* ── WEAK CARDS SECTION ── */}
        {weakCards.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-8 sm:py-12 md:py-16">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-8 sm:mb-12">
              <div className="flex items-center gap-3 sm:gap-4 text-[#FF3D00]">
                {/* ↓ icon scales up on sm */}
                <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 shrink-0" />
                <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">
                  TARGET FOCUS
                </h2>
              </div>
              <div className="h-[1px] flex-1 bg-[#262626]" />
              {/* ↓ full width on mobile, auto on sm+ */}
              <PrimaryButton
                onClick={() => startDeckSession(true)}
                className="w-full sm:w-auto justify-center sm:justify-start"
              >
                <span className="hidden sm:inline">REVIEW WEAK CARDS</span>
                <span className="sm:hidden">REVIEW WEAK</span>
              </PrimaryButton>
            </div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              // ↓ single col mobile, 2-col from sm
              className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-[#262626]"
            >
              {weakCards.map((card) => (
                <motion.div
                  key={card._id}
                  variants={fadeUp}
                  // ↓ reduced min-h on mobile
                  className="group relative border-b border-r border-[#262626] p-5 sm:p-8 overflow-hidden flex flex-col min-h-[200px] sm:min-h-[300px]"
                >
                  <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />

                  <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                    <div className="flex justify-between items-start mb-4 sm:mb-6">
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#FF3D00] group-hover:text-[#0A0A0A]/60">
                        {card.difficulty}
                      </span>
                      <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-[#0A0A0A]/60">
                        MASTERY: {card.mastery}%
                      </span>
                    </div>

                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight leading-tight mb-4 text-[#FAFAFA] group-hover:text-[#0A0A0A]">
                      {card.question}
                    </h3>
                    <p className="text-sm text-[#737373] group-hover:text-[#0A0A0A]/80 line-clamp-3 leading-relaxed mt-auto">
                      {card.answer}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {/* ── ALL CARDS LIST ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-8 sm:py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">
              INVENTORY
            </h2>
            <div className="h-[1px] flex-1 bg-[#262626]" />
            <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
              {cards.length.toString().padStart(2, "0")}
              <span className="hidden sm:inline"> TOTAL ENTITIES</span>
            </span>
          </div>

          {isLoading ? (
            // ↓ 1-col mobile, 2-col sm, 3-col lg; reduced gap on mobile
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-48 sm:h-64 border border-[#262626] bg-[#0A0A0A] animate-pulse"
                />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
              <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
                VOID.
              </h3>
              <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
                NO ENTITIES POPULATED.
              </p>
              <PrimaryButton onClick={() => setShowAddCard(true)}>
                CREATE FIRST CARD <ArrowRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
            </div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              // ↓ 1-col mobile, 2-col sm, 3-col lg with shared border pattern
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]"
            >
              {cards.map((card) => (
                <motion.div
                  key={card._id}
                  variants={fadeUp}
                  // ↓ graduated min-h across breakpoints
                  className="group relative border-b border-r border-[#262626] p-5 sm:p-8 overflow-hidden flex flex-col min-h-[200px] sm:min-h-[260px] lg:min-h-[300px]"
                >
                  <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />

                  <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                    <div className="flex justify-between items-start mb-4 sm:mb-6 gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-bold tracking-[0.2em] uppercase transition-colors group-hover:text-[#0A0A0A]/60",
                          card.difficulty === "hard"
                            ? "text-[#FF3D00]"
                            : "text-[#737373]"
                        )}
                      >
                        {card.difficulty}
                      </span>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] group-hover:text-[#0A0A0A]/80 uppercase">
                          VOL {card.mastery}%
                        </span>
                        <span className="text-[8px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-[#0A0A0A]/40 uppercase">
                          REV: {new Date(card.nextReview).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-lg sm:text-xl font-bold tracking-tight leading-tight mb-4 text-[#FAFAFA] group-hover:text-[#0A0A0A]">
                      {card.question}
                    </h3>
                    <p className="text-sm text-[#737373] group-hover:text-[#0A0A0A]/80 line-clamp-3 leading-relaxed mt-auto">
                      {card.answer}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      <AddCardModal
        open={showAddCard}
        onClose={() => setShowAddCard(false)}
        onSubmit={handleAddCard}
      />
    </PageWrapper>
  );
}