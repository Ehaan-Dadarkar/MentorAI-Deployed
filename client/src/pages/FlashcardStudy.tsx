import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Play, Eye, BrainCircuit } from "lucide-react";
import { useFlashcardStore, type ReviewGrade } from "@/store/flashcardStore";
import { cn } from "@/lib/utils";

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
      "group relative inline-flex items-center gap-2 overflow-hidden bg-transparent",
      // ↓ responsive padding
      "px-4 sm:px-6 py-3 sm:py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase disabled:opacity-50",
      className,
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-0.5 bg-[#FF3D00]"
    />
    <motion.div
      variants={{ initial: { scaleX: 1, originX: 1 }, hover: { scaleX: 0, originX: 1 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#262626]"
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
      "group relative inline-flex items-center gap-2 overflow-hidden bg-transparent px-4 py-3 text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] transition-colors",
      className,
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#FAFAFA]"
    />
  </motion.button>
);

const ActionButton = ({
  icon: Icon,
  label,
  value,
  onClick,
  className,
}: {
  icon: any;
  label: string;
  value: string;
  onClick: () => void;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "group flex flex-col items-center justify-center border border-[#262626]",
      // ↓ responsive padding
      "p-4 sm:p-6",
      "transition-all duration-300 hover:border-[#FAFAFA] bg-[#0A0A0A]",
      className,
    )}
  >
    <Icon className="w-5 h-5 sm:w-6 sm:h-6 mb-2 sm:mb-3 text-[#737373] group-hover:text-[#FAFAFA] transition-colors" />
    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-[#FAFAFA] uppercase mb-1">
      {label}
    </span>
    <span className="text-lg sm:text-xl font-bold tracking-tighter text-[#FAFAFA]">
      {value}
    </span>
  </button>
);

// ── Shared Animation Config ─────────────────────────────────

const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

export default function FlashcardStudy() {
  const navigate = useNavigate();
  const { deckId = "" } = useParams();
  const {
    currentDeck,
    cards,
    sessionCards,
    sessionResults,
    weakCards,
    aiSuggestion,
    isFetchingWeak,
    loadDeck,
    fetchDueCards,
    startSession,
    reviewCard,
    finishSession,
    completeSession,
    fetchWeakCards,
    fetchAISuggestion,
  } = useFlashcardStore();

  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviews, setReviews] = useState<
    Array<{ cardId: string; grade: ReviewGrade }>
  >([]);
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false);

  const currentCard = sessionCards[cardIndex];

  // Initialize session if needed
  useEffect(() => {
    const setup = async () => {
      if (sessionCards.length > 0) return;
      if (deckId === "due") {
        await fetchDueCards();
        const freshDue = useFlashcardStore.getState().dueCards;
        startSession(freshDue);
      } else {
        await loadDeck(deckId);
        const freshCards = useFlashcardStore.getState().cards;
        startSession(freshCards);
      }
    };
    void setup();
  }, [deckId, sessionCards.length, loadDeck, fetchDueCards, startSession]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setIsFlipped((prev) => !prev);
      }
      if (!isFlipped || !currentCard || sessionResults?.endedAt) return;
      if (event.key === "1") { event.preventDefault(); void handleGrade("missed"); }
      if (event.key === "2") { event.preventDefault(); void handleGrade("almost"); }
      if (event.key === "3") { event.preventDefault(); void handleGrade("got_it"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFlipped, currentCard, sessionResults?.endedAt]);

  // Fetch AI suggestion after session completes
  useEffect(() => {
    const pullWeakSuggestion = async () => {
      if (!sessionResults?.endedAt) return;
      if (deckId === "due") return;
      await fetchWeakCards(deckId);
      const weak = useFlashcardStore.getState().weakCards;
      if (weak.length === 0) return;
      setIsFetchingSuggestion(true);
      await fetchAISuggestion(
        weak.map((card) => ({
          question: card.question,
          answer: card.answer,
          mastery: card.mastery,
        })),
      );
      setIsFetchingSuggestion(false);
    };
    void pullWeakSuggestion();
  }, [deckId, sessionResults?.endedAt, fetchWeakCards, fetchAISuggestion]);

  const progressPct =
    sessionCards.length > 0 ? ((cardIndex + 1) / sessionCards.length) * 100 : 0;

  const missedCards = useMemo(() => {
    if (!sessionResults?.missedCardIds?.length) return [];
    const idSet = new Set(sessionResults.missedCardIds);
    return sessionCards.filter((card) => idSet.has(card._id));
  }, [sessionResults?.missedCardIds, sessionCards]);

  const durationMinutes = useMemo(() => {
    if (!sessionResults?.startedAt || !sessionResults?.endedAt) return 0;
    const diff =
      new Date(sessionResults.endedAt).getTime() -
      new Date(sessionResults.startedAt).getTime();
    return Math.max(0, Math.round(diff / 60000));
  }, [sessionResults?.startedAt, sessionResults?.endedAt]);

  const handleGrade = async (grade: ReviewGrade) => {
    if (!currentCard) return;
    await reviewCard(currentCard._id, grade);
    const nextReviews = [...reviews, { cardId: currentCard._id, grade }];
    setReviews(nextReviews);
    if (cardIndex + 1 >= sessionCards.length) {
      if (deckId !== "due") await completeSession(deckId, nextReviews);
      finishSession();
      return;
    }
    setCardIndex((idx) => idx + 1);
    setIsFlipped(false);
  };

  const restartWithMissed = () => {
    if (!missedCards.length) return;
    startSession(missedCards);
    setCardIndex(0);
    setIsFlipped(false);
    setReviews([]);
  };

  // ── Session Complete Screen ───────────────────────────────

  if (sessionResults?.endedAt) {
    return (
      <div className="h-screen overflow-y-auto custom-scrollbar bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white">
        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 pt-10 sm:pt-20 md:pt-32 pb-8 sm:pb-16 min-h-screen flex flex-col">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="flex flex-col flex-1"
          >
            {/* Header */}
            <motion.div variants={fadeUp} className="mb-8 sm:mb-12 md:mb-16">
              {/* ↓ hero heading scales from text-4xl on mobile */}
              <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter leading-none mb-4 sm:mb-6">
                SESSION
                <br />
                <span className="text-[#FF3D00]">CONCLUDED.</span>
              </h1>
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                  COGNITIVE ASSIMILATION COMPLETE
                </p>
              </div>
            </motion.div>

            {/* Metrics Grid */}
            <motion.div
              variants={fadeUp}
              // ↓ single col mobile → 3-col sm+
              className="grid grid-cols-1 sm:grid-cols-3 border-t border-l border-[#262626] mb-8 sm:mb-12 md:mb-16"
            >
              {/* ↓ consistent reduced padding on mobile */}
              <div className="border-b border-r border-[#262626] p-6 sm:p-8 md:p-12 bg-[#0A0A0A] flex flex-col justify-between min-h-50">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4">
                  ACCURACY
                </p>
                {/* ↓ number scales from text-4xl */}
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FF3D00]">
                  {sessionResults.accuracy}
                  <span className="text-xl sm:text-2xl text-[#737373] ml-1">%</span>
                </p>
              </div>
              <div className="border-b border-r border-[#262626] p-6 sm:p-8 md:p-12 flex flex-col justify-between min-h-50">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4">
                  CARDS REVIEWED
                </p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">
                  {sessionResults.cardsReviewed}
                </p>
              </div>
              <div className="border-b border-r border-[#262626] p-6 sm:p-8 md:p-12 flex flex-col justify-between min-h-50">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4">
                  DURATION
                </p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">
                  {durationMinutes}
                  <span className="text-xl sm:text-2xl text-[#737373] ml-1">MIN</span>
                </p>
              </div>
            </motion.div>

            {/* Mastery Shift Grid */}
            <motion.div
              variants={fadeUp}
              className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-[#262626] mb-8 sm:mb-12 md:mb-16"
            >
              <div className="border-b border-r border-[#262626] p-5 sm:p-8 flex items-center justify-between bg-[#FAFAFA] text-[#0A0A0A]">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-[#0A0A0A]/60 uppercase mb-2">
                    PRIOR MASTERY
                  </p>
                  {/* ↓ scales from text-2xl */}
                  <p className="text-2xl sm:text-3xl font-bold tracking-tighter">
                    {sessionResults.masteryBeforeAvg}%
                  </p>
                </div>
              </div>
              <div className="border-b border-r border-[#262626] p-5 sm:p-8 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-2">
                    CURRENT MASTERY
                  </p>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <p
                      className={cn(
                        "text-2xl sm:text-3xl font-bold tracking-tighter",
                        sessionResults.masteryAfterAvg >= sessionResults.masteryBeforeAvg
                          ? "text-[#FF3D00]"
                          : "text-[#FAFAFA]",
                      )}
                    >
                      {sessionResults.masteryAfterAvg}%
                    </p>
                    <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#737373]" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Missed Cards + AI Insight */}
            {/* ↓ stacks on mobile, 2-col from md */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 md:gap-16 mb-8 sm:mb-12 md:mb-16 flex-1">

              {/* Missed Cards Column */}
              {missedCards.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-5 sm:mb-8">
                    <h2 className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                      NEEDS REINFORCEMENT
                    </h2>
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                      {missedCards.length} ITEMS
                    </span>
                  </div>
                  <div className="border border-[#262626] divide-y divide-[#262626] max-h-75 overflow-y-auto custom-scrollbar">
                    {missedCards.map((card) => (
                      <div key={card._id} className="p-4 sm:p-6">
                        <p className="text-sm font-bold uppercase leading-relaxed text-[#FAFAFA]">
                          {card.question}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Insight Column */}
              <div>
                <div className="flex items-center justify-between mb-5 sm:mb-8">
                  <h2 className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                    AI SYNTHESIS
                  </h2>
                  <BrainCircuit className="w-4 h-4 text-[#737373]" />
                </div>

                {isFetchingWeak || isFetchingSuggestion ? (
                  <div className="border border-[#262626] p-6 sm:p-8 flex flex-col items-center justify-center min-h-75">
                    <div className="w-8 h-8 rounded-full border-t-2 border-[#FF3D00] animate-spin mb-4 sm:mb-6" />
                    <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase animate-pulse text-center">
                      EXTRACTING COGNITIVE WEAKNESSES...
                    </p>
                  </div>
                ) : aiSuggestion ? (
                  <div className="border border-[#FF3D00] p-6 sm:p-8 bg-[#FF3D00]/5 min-h-75 relative overflow-hidden">
                    <p className="text-sm text-[#FAFAFA] leading-loose font-medium relative z-10">
                      {aiSuggestion}
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#262626] p-6 sm:p-8 flex items-center justify-center min-h-75 text-center">
                    <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                      INSUFFICIENT DATA FOR AI SYNTHESIS
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Footer */}
            <motion.div
              variants={fadeUp}
              // ↓ flex-wrap + smaller gap on mobile
              className="flex flex-wrap gap-4 sm:gap-8 items-center pt-6 sm:pt-8 border-t border-[#262626] mt-auto"
            >
              <GhostButton
                onClick={() =>
                  navigate(deckId === "due" ? "/flashcards" : `/flashcards/${deckId}`)
                }
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> EXIT SESSION
              </GhostButton>
              {missedCards.length > 0 && (
                <PrimaryButton onClick={restartWithMissed}>
                  {/* ↓ shorter label on mobile */}
                  <span className="hidden sm:inline">RE-ENGAGE MISSED CARDS</span>
                  <span className="sm:hidden">RETRY MISSED</span>
                  <Play className="w-4 h-4 ml-2" />
                </PrimaryButton>
              )}
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Loading State ─────────────────────────────────────────

  if (!currentCard) {
    return (
      <div className="h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col items-center justify-center relative px-4">
        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        <div className="w-12 h-12 rounded-full border-t-2 border-[#FF3D00] border-r-2 border-r-transparent animate-spin mb-8" />
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase animate-pulse text-center">
          INITIALIZING COGNITIVE INTERFACE...
        </p>
      </div>
    );
  }

  // ── Study Session UI ──────────────────────────────────────

  return (
    <div className="h-screen overflow-y-auto custom-scrollbar bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-8 sm:pb-16 md:pb-32">
      {/* NOISE TEXTURE */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />

      {/* Fixed Header */}
      <div className="border-b border-[#262626] bg-[#0A0A0A] fixed top-0 left-0 right-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <button
              onClick={() =>
                navigate(deckId === "due" ? "/flashcards" : `/flashcards/${deckId}`)
              }
              // ↓ bigger tap target on mobile
              className="text-[#737373] hover:text-[#FF3D00] transition-colors p-1"
            >
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            {/* ↓ truncate long deck names on mobile */}
            <h1 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#FAFAFA] truncate max-w-[140px] sm:max-w-none">
              {deckId === "due" ? "DUE CARDS" : currentDeck?.name || "ACTIVE SESSION"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase whitespace-nowrap">
              {/* ↓ show shorter label on mobile */}
              <span className="sm:hidden">
                <span className="text-[#FF3D00]">{cardIndex + 1}</span>/{sessionCards.length}
              </span>
              <span className="hidden sm:inline">
                INDEX <span className="text-[#FF3D00]">{cardIndex + 1}</span> / {sessionCards.length}
              </span>
            </span>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="w-full h-px bg-[#262626]">
          <motion.div
            className="h-full bg-[#FF3D00]"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3, ease: easing }}
          />
        </div>
      </div>

      {/* ↓ pt offset matches smaller header on mobile */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 pt-28 sm:pt-36 md:pt-48">
        <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto">

          {/* 3D Flashcard */}
          <div
            style={{ perspective: "2000px" }}
            // ↓ portrait-ish on mobile, wide on md
            className="w-full aspect-4/3 md:aspect-21/9"
          >
            <motion.button
              onClick={() => setIsFlipped((f) => !f)}
              className="w-full h-full relative border border-[#262626] bg-transparent cursor-pointer group"
              style={{ transformStyle: "preserve-3d" }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 bg-[#0A0A0A] p-5 sm:p-8 md:p-12 flex flex-col justify-between group-hover:border-[#FAFAFA] transition-colors duration-500"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="border border-[#262626] px-2 sm:px-3 py-1 shrink-0">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                      {currentCard.difficulty}
                    </span>
                  </div>
                  {/* ↓ context-aware flip hint: spacebar on desktop, tap on mobile */}
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase animate-pulse text-right">
                    <span className="hidden sm:inline">[ SPACEBAR TO FLIP ]</span>
                    <span className="sm:hidden">[ TAP TO FLIP ]</span>
                  </span>
                </div>

                {/* ↓ question text scales from text-2xl on mobile */}
                <p className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tighter leading-tight text-[#FAFAFA] text-left">
                  {currentCard.question}
                </p>

                <div className="flex justify-end">
                  <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-[#262626] group-hover:text-[#FAFAFA] transition-colors duration-500" />
                </div>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 bg-[#FAFAFA] p-5 sm:p-8 md:p-12 flex flex-col justify-center"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                {/* ↓ left offset responsive */}
                <div className="absolute top-5 sm:top-8 left-5 sm:left-12 flex items-center gap-3 sm:gap-4">
                  <div className="h-1 w-6 sm:w-8 bg-[#FF3D00]" />
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#0A0A0A]/40 uppercase">
                    ANSWER
                  </span>
                </div>
                {/* ↓ answer text scales from text-xl on mobile */}
                <p className="text-xl sm:text-2xl md:text-4xl font-medium tracking-tight text-[#0A0A0A] leading-relaxed text-left max-h-full overflow-y-auto custom-scrollbar mt-10 sm:mt-12 pr-2 sm:pr-4">
                  {currentCard.answer}
                </p>
              </div>
            </motion.button>
          </div>

          {/* Grade Actions */}
          {/* ↓ enough min-h for 3-col on sm+, and taller on mobile for stacked layout */}
          <div className="w-full mt-6 sm:mt-12 relative min-h-35">
            <AnimatePresence>
              {isFlipped && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.4, ease: easing }}
                  // ↓ stacked on mobile, 3-col from sm
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 absolute inset-x-0"
                >
                  <button
                    onClick={() => void handleGrade("missed")}
                    className="group border border-[#262626] p-5 sm:p-8 bg-[#0A0A0A] hover:bg-[#FF3D00] hover:border-[#FF3D00] transition-colors flex flex-row sm:flex-col items-center sm:justify-center justify-between sm:text-center focus:outline-none focus:ring-1 focus:ring-[#FAFAFA]"
                  >
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-black uppercase sm:mb-3">
                      [ KEY : 1 ]
                    </span>
                    <span className="text-xl sm:text-2xl font-bold tracking-tighter text-[#FAFAFA] group-hover:text-black">
                      MISSED
                    </span>
                  </button>

                  <button
                    onClick={() => void handleGrade("almost")}
                    className="group border border-[#262626] p-5 sm:p-8 bg-[#0A0A0A] hover:bg-[#FAFAFA] hover:border-[#FAFAFA] transition-colors flex flex-row sm:flex-col items-center sm:justify-center justify-between sm:text-center focus:outline-none focus:ring-1 focus:ring-[#FF3D00]"
                  >
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-black uppercase sm:mb-3">
                      [ KEY : 2 ]
                    </span>
                    <span className="text-xl sm:text-2xl font-bold tracking-tighter text-[#FAFAFA] group-hover:text-black">
                      ALMOST
                    </span>
                  </button>

                  <button
                    onClick={() => void handleGrade("got_it")}
                    className="group border border-[#262626] border-b-2 border-b-[#FF3D00] p-5 sm:p-8 bg-transparent hover:bg-[#262626] transition-colors flex flex-row sm:flex-col items-center sm:justify-center justify-between sm:text-center focus:outline-none focus:ring-1 focus:ring-[#FF3D00]"
                  >
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-[#FAFAFA] uppercase sm:mb-3">
                      [ KEY : 3 ]
                    </span>
                    <span className="text-xl sm:text-2xl font-bold tracking-tighter text-[#FF3D00] group-hover:text-[#FF3D00]">
                      GOT IT
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}