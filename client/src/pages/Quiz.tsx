import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Clock3,
  ChevronRight,
  ChevronDown,
  Brain,
  Plus,
  BookOpen,
  ArrowLeft,
} from "lucide-react";
import api from "@/lib/axios";
import type { Note, Quiz } from "@/types";
import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { useQuizStore, type QuizDifficulty } from "@/store/appStore";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { cn } from "@/lib/utils";

type QuizView = "library" | "deck-detail" | "quiz" | "results";
type QuizSourceMode = "notes" | "flashcards";

const QUESTION_COUNTS: Array<5 | 10 | 20> = [5, 10, 20];
const DIFFICULTIES: QuizDifficulty[] = ["easy", "medium", "hard"];

function getGrade(score: number) {
  if (score >= 90) return { letter: "A", color: "text-[#FAFAFA]" };
  if (score >= 80) return { letter: "B", color: "text-[#FAFAFA]" };
  if (score >= 70) return { letter: "C", color: "text-[#737373]" };
  if (score >= 60) return { letter: "D", color: "text-[#737373]" };
  return { letter: "F", color: "text-[#FF3D00]" };
}

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

function AnimatedScore({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 900;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) { setDisplay(value); clearInterval(interval); }
      else setDisplay(Math.round(current));
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);
  return <>{display}</>;
}

interface FlashcardDeck { _id: string; name: string; subject: string; }
interface FlashcardItem { question: string; answer: string; }
interface DeckReviewRow {
  question: string; options: string[]; correctIndex: number;
  selectedIndex: number; isCorrect: boolean; explanation: string; concept: string;
}

function getDeckMetrics(deck: Quiz) {
  const total = deck.questions.length;
  const answered = deck.questions.filter((q) => typeof q.userAnswer === "number" && q.userAnswer >= 0).length;
  const correct = deck.questions.filter((q) => typeof q.userAnswer === "number" && q.userAnswer === q.correctAnswer).length;
  return { total, answered, correct, incorrect: Math.max(0, answered - correct) };
}

function getDeckReviewRows(deck: Quiz): DeckReviewRow[] {
  return deck.questions.map((question) => {
    const selectedIndex = typeof question.userAnswer === "number" ? question.userAnswer : -1;
    const correctIndex = question.correctAnswer;
    return {
      question: question.question, options: question.options,
      correctIndex, selectedIndex, isCorrect: selectedIndex === correctIndex,
      explanation: question.explanation || "No explanation provided.",
      concept: question.topic || "General",
    };
  });
}

const easing = [0.25, 0, 0, 1] as const;
const staggerContainer = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } } };

// ── Buttons ──────────────────────────────────────────────────

const PrimaryButton = ({
  children, onClick, className, disabled, type = "button",
}: {
  children: React.ReactNode; onClick?: () => void;
  className?: string; disabled?: boolean; type?: "button" | "submit" | "reset";
}) => (
  <motion.button
    type={type} whileHover="hover" initial="initial"
    onClick={onClick} disabled={disabled}
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
  children, onClick, className, disabled, type = "button",
}: {
  children: React.ReactNode; onClick?: () => void;
  className?: string; disabled?: boolean; type?: "button" | "submit" | "reset";
}) => (
  <motion.button
    type={type} whileHover="hover" initial="initial"
    onClick={onClick} disabled={disabled}
    className={cn(
      "group relative inline-flex items-center justify-center gap-2 overflow-hidden",
      "bg-transparent px-4 py-3",
      "text-[10px] font-bold tracking-widest text-[#737373] uppercase",
      "hover:text-[#FAFAFA] transition-colors",
      "disabled:opacity-50 disabled:cursor-not-allowed",
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

// ── Main ─────────────────────────────────────────────────────

export default function QuizPage() {
  const navigate = useNavigate();
  const remaining = useRateLimitStore((s) => s.remaining);
  const limit = useRateLimitStore((s) => s.limit);
  const resetTime = useRateLimitStore((s) => s.resetTime);
  const {
    currentQuiz, answers, results, isGenerating, isSubmitting,
    generateQuiz, deleteQuizDeck, fetchQuiz, setAnswer, submitQuiz, resetSession,
  } = useQuizStore();

  const [view, setView] = useState<QuizView>("library");
  const [isNewDeckModalOpen, setIsNewDeckModalOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [deckName, setDeckName] = useState("");
  const [count, setCount] = useState<5 | 10 | 20>(10);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [createFlashcardDeck, setCreateFlashcardDeck] = useState(false);
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedSourceDeckId, setSelectedSourceDeckId] = useState("");
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [quizDecks, setQuizDecks] = useState<Quiz[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedDeckForDetailId, setSelectedDeckForDetailId] = useState<string | null>(null);
  const [selectedDeckForDetail, setSelectedDeckForDetail] = useState<Quiz | null>(null);
  const [isDeckDetailLoading, setIsDeckDetailLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  const totalQuizSeconds = count * 45;
  const timeLeft = Math.max(0, totalQuizSeconds - elapsedSeconds);

  const libraryCards = useMemo(() => {
    const latestByDeck = new Map<string, Quiz>();
    for (const quiz of quizDecks) {
      const key = String(quiz.deckId || quiz._id);
      const existing = latestByDeck.get(key);
      if (!existing) { latestByDeck.set(key, quiz); continue; }
      const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
      const nextTime = new Date(quiz.updatedAt || quiz.createdAt).getTime();
      if (nextTime > existingTime) latestByDeck.set(key, quiz);
    }
    return Array.from(latestByDeck.values()).sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [quizDecks]);

  const loadLibraryData = async () => {
    setLibraryError(null);
    setIsLibraryLoading(true);
    try {
      const { data } = await api.get("/quiz");
      setQuizDecks(data.quizzes || []);
    } catch { setLibraryError("Failed to load quiz decks."); }
    finally { setIsLibraryLoading(false); }
  };

  const loadDeckDetail = async (quizId: string) => {
    setIsDeckDetailLoading(true);
    setLibraryError(null);
    try {
      const { data } = await api.get(`/quiz/${quizId}`);
      setSelectedDeckForDetail(data.quiz || null);
    } catch { setLibraryError("Failed to load quiz deck details."); setSelectedDeckForDetail(null); }
    finally { setIsDeckDetailLoading(false); }
  };

  useEffect(() => { if (view !== "library") return; void loadLibraryData(); }, [view]);

  useEffect(() => {
    if (!isNewDeckModalOpen) return;
    const loadSourceData = async () => {
      setSourceError(null); setIsSourceLoading(true);
      try {
        if (sourceMode === "notes") {
          const { data } = await api.get("/notes", { params: { deleted: false } });
          setNotes(data.notes || []); return;
        }
        const { data } = await api.get("/flashcards/decks");
        setDecks(data.decks || []);
      } catch { setSourceError("Failed to load source data."); }
      finally { setIsSourceLoading(false); }
    };
    void loadSourceData();
  }, [sourceMode, isNewDeckModalOpen]);

  useEffect(() => {
    if (view !== "quiz") return;
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (view !== "quiz" || !currentQuiz || timeLeft > 0) return;
    void handleFinishQuiz();
  }, [timeLeft, view, currentQuiz]);

  useEffect(() => {
    if (!isGenerating) { setLoadingStepIndex(0); return; }
    const interval = setInterval(() => setLoadingStepIndex((idx) => (idx + 1) % 3), 900);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (view !== "quiz" || !currentQuiz) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const selected = answers[questionIndex] ?? -1;
      if (["1","2","3","4"].includes(event.key)) {
        const optionIndex = Number(event.key) - 1;
        if (selected === -1) { event.preventDefault(); setAnswer(questionIndex, optionIndex); }
        return;
      }
      if (event.key === "Enter" && selected !== -1) {
        event.preventDefault();
        if (questionIndex < currentQuiz.questions.length - 1) setQuestionIndex((i) => i + 1);
        else void handleFinishQuiz();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, currentQuiz, questionIndex, answers, setAnswer]);

  const openNewDeckSetup = () => {
    resetSession(); setSourceError(null); setQuestionIndex(0);
    setElapsedSeconds(0); setExpandedRows({}); setCreateFlashcardDeck(false);
    setIsNewDeckModalOpen(true);
  };

  const handleOpenDeckDetail = (deck: Quiz) => {
    setSelectedDeckForDetailId(deck._id);
    setSelectedDeckForDetail(deck);
    setExpandedRows({});
    setView("deck-detail");
    void loadDeckDetail(deck._id);
  };

  const handleGenerate = async () => {
    setSourceError(null);
    const normalizedDeckName = deckName.trim();
    if (!normalizedDeckName) { setSourceError("Enter a name for the quiz deck."); return; }

    let generatedContent: string | undefined;
    let generatedSubject = "General";

    if (sourceMode === "notes") {
      if (!selectedNoteId) { setSourceError("Select a note."); return; }
      try {
        const { data } = await api.get(`/notes/${selectedNoteId}`);
        const note = data.note;
        const plain = stripHtml(note?.content || "");
        if (plain.length < 10) { setSourceError("Note is too short."); return; }
        generatedContent = plain;
        generatedSubject = note?.subject || note?.title || generatedSubject;
      } catch { setSourceError("Failed to load note."); return; }
    }

    if (sourceMode === "flashcards") {
      if (!selectedSourceDeckId) { setSourceError("Select a flashcard deck."); return; }
      try {
        const { data } = await api.get(`/flashcards/decks/${selectedSourceDeckId}`);
        const cards = (data.cards || []) as FlashcardItem[];
        if (!cards.length) { setSourceError("Selected deck has no flashcards."); return; }
        generatedContent = cards.slice(0, 80)
          .map((card, idx) => `Card ${idx + 1}\nQuestion: ${card.question}\nAnswer: ${card.answer}`)
          .join("\n\n");
        generatedSubject = data.deck?.subject || data.deck?.name || generatedSubject;
      } catch { setSourceError("Failed to load flashcard deck."); return; }
    }

    const generatedQuiz = await generateQuiz({
      subject: generatedSubject, topic: topic.trim() || undefined,
      count, difficulty, content: generatedContent,
      deckName: normalizedDeckName, createFlashcardDeck,
    });

    setQuizDecks((prev) => [generatedQuiz, ...prev.filter((q) => q._id !== generatedQuiz._id)]);
    setQuestionIndex(0); setElapsedSeconds(0); setExpandedRows({});
    setIsNewDeckModalOpen(false);
    handleOpenDeckDetail(generatedQuiz);
  };

  const handleStartDeckQuiz = async (quizId: string) => {
    try {
      await fetchQuiz(quizId);
      setQuestionIndex(0); setElapsedSeconds(0); setExpandedRows({});
      setView("quiz");
    } catch { setLibraryError("Failed to load quiz."); }
  };

  const handleDeleteDeck = async (deck: Quiz) => {
    const deckTitle = deck.deckName || `${deck.subject} Quiz Deck`;
    if (!window.confirm(`DELETE [${deckTitle}]? THIS ACTION IS IRREVERSIBLE.`)) return;
    try {
      await deleteQuizDeck(deck._id);
      if (selectedDeckForDetailId === deck._id) {
        setSelectedDeckForDetailId(null); setSelectedDeckForDetail(null);
        setExpandedRows({}); setView("library");
      }
      await loadLibraryData();
    } catch { setLibraryError("Failed to delete quiz deck."); }
  };

  const handleFinishQuiz = async () => {
    const data = await submitQuiz(elapsedSeconds);
    setExpandedRows({});
    if (selectedDeckForDetailId) await loadDeckDetail(selectedDeckForDetailId);
    await loadLibraryData();
    setView("results");
    return data;
  };

  const handleBackToLibrary = () => { setExpandedRows({}); setView("library"); };

  const loadingTexts = ["ANALYZING SOURCE [.]", "CRAFTING QUERIES [..]", "INITIALIZING [...]"];

  // ── New Deck Form ─────────────────────────────────────────
  const renderNewDeckForm = () => (
    <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
      {/* Data source */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
          DATA SOURCE
        </label>
        <div className="flex flex-wrap gap-2">
          {([["notes", "FROM NOTES"], ["flashcards", "FROM FLASHCARDS"]] as Array<[QuizSourceMode, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSourceMode(key)}
              className={cn(
                "px-4 sm:px-6 py-3 sm:py-4 text-[10px] font-bold tracking-widest border transition-all duration-300 uppercase",
                sourceMode === key
                  ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                  : "bg-transparent text-[#737373] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
              )}
            >
              {key === "notes" ? "NOTES" : "FLASHCARDS"}
            </button>
          ))}
        </div>
      </div>

      {sourceMode === "notes" && (
        <div className="space-y-3">
          <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
            SELECT NOTE
          </label>
          <select
            value={selectedNoteId}
            onChange={(e) => setSelectedNoteId(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#262626] px-4 py-3 sm:py-4 text-xs font-bold tracking-widest text-[#FAFAFA] focus:outline-none focus:border-[#FAFAFA] transition-colors appearance-none uppercase"
            disabled={isSourceLoading}
          >
            <option value="">-- CHOOSE A NOTE --</option>
            {notes.map((note) => (
              <option key={note._id} value={note._id}>
                {note.title} ({note.subject || "GENERAL"})
              </option>
            ))}
          </select>
        </div>
      )}

      {sourceMode === "flashcards" && (
        <div className="space-y-3">
          <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
            SELECT DECK
          </label>
          <select
            value={selectedSourceDeckId}
            onChange={(e) => setSelectedSourceDeckId(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#262626] px-4 py-3 sm:py-4 text-xs font-bold tracking-widest text-[#FAFAFA] focus:outline-none focus:border-[#FAFAFA] transition-colors appearance-none uppercase"
            disabled={isSourceLoading}
          >
            <option value="">-- CHOOSE A DECK --</option>
            {decks.map((deck) => (
              <option key={deck._id} value={deck._id}>
                {deck.name} ({deck.subject || "GENERAL"})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
          QUIZ DECK NAME
        </label>
        <input
          type="text" value={deckName} onChange={(e) => setDeckName(e.target.value)}
          placeholder="E.G. MIDTERM_EXAM_01"
          className="w-full bg-transparent border border-[#262626] px-4 py-3 sm:py-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase"
        />
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
          TOPIC (OPTIONAL)
        </label>
        <input
          type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="E.G. ALGORITHMS"
          className="w-full bg-transparent border border-[#262626] px-4 py-3 sm:py-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase"
        />
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
          QUESTIONS
        </label>
        <div className="flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((value) => (
            <button
              key={value} onClick={() => setCount(value)}
              className={cn(
                "px-4 sm:px-6 py-3 sm:py-4 text-[10px] font-bold tracking-widest border transition-all duration-300",
                count === value
                  ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                  : "bg-transparent text-[#737373] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-[#737373] uppercase block">
          DIFFICULTY
        </label>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTIES.map((value) => (
            <button
              key={value} onClick={() => setDifficulty(value)}
              className={cn(
                "px-4 sm:px-6 py-3 sm:py-4 text-[10px] font-bold tracking-widest border transition-all duration-300 uppercase",
                difficulty === value
                  ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                  : "bg-transparent text-[#737373] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-4 border border-[#262626] bg-[#0A0A0A] p-4 sm:p-6 cursor-pointer hover:border-[#FAFAFA] transition-colors">
        <input
          type="checkbox" checked={createFlashcardDeck}
          onChange={(e) => setCreateFlashcardDeck(e.target.checked)}
          className="h-5 w-5 appearance-none border border-[#262626] checked:bg-[#FAFAFA] checked:border-[#FAFAFA] relative after:content-[''] checked:after:absolute checked:after:bg-[#0A0A0A] checked:after:inset-1 transition-colors shrink-0"
        />
        <span className="text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase">
          ALSO CREATE FLASHCARD DECK
        </span>
      </label>

      <AnimatePresence>
        {sourceError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
          >
            <div className="border border-[#FF3D00] bg-[#FF3D00]/5 p-4 text-[10px] font-bold tracking-widest text-[#FF3D00] uppercase">
              [ ERROR ] {sourceError}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PrimaryButton
        onClick={() => void handleGenerate()} className="w-full"
        disabled={isGenerating || isSourceLoading}
      >
        {isGenerating ? (
          <><Sparkles className="w-4 h-4 mr-2 animate-spin" />{loadingTexts[loadingStepIndex]}</>
        ) : "INITIALIZE QUIZ"}
      </PrimaryButton>
    </div>
  );

  // ── New Deck Modal ────────────────────────────────────────
  const renderNewDeckModal = () => (
    <AnimatePresence>
      {isNewDeckModalOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-end sm:items-center justify-end sm:justify-center p-0 sm:p-4 bg-[#0A0A0A]/90 backdrop-blur-sm"
          onClick={() => setIsNewDeckModalOpen(false)}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: easing } as any}
            className="bg-[#0A0A0A] border border-[#262626] border-b-0 sm:border-b p-5 sm:p-8 md:p-12 w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto relative rounded-t-2xl sm:rounded-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle on mobile */}
            <div className="sm:hidden w-10 h-1 bg-[#262626] rounded-full mx-auto mb-4" />

            <div className="flex justify-between items-start mb-4 border-b border-[#262626] pb-5 sm:pb-8">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">
                    [ CREATION ]
                  </span>
                  <span className="h-px w-8 bg-[#262626]" />
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none text-[#FAFAFA]">
                  NEW DECK.
                </h1>
              </div>
              <button
                onClick={() => setIsNewDeckModalOpen(false)}
                className="text-[#737373] hover:text-[#FF3D00] transition-colors p-2"
              >
                <XCircle className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>
            </div>
            {renderNewDeckForm()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <PageWrapper>
      <RateLimitBanner remaining={remaining} limit={limit} resetTime={resetTime} showAddKeyPrompt={true} />

      {/* Noise */}
      <div
        className="pointer-events-none fixed inset-0 z-30 opacity-[0.015] mix-blend-overlay"
        style={{ backgroundImage: 'url(' + '"data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E"' + ')' }}
      />

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-12 py-6 sm:py-8 md:py-12 relative z-10">
        <AnimatePresence mode="wait">

          {/* ── LIBRARY VIEW ── */}
          {view === "library" && (
            <motion.div key="library" variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-8 sm:gap-12">
              <motion.div variants={fadeUp} className="flex flex-col gap-4 border-b border-[#262626] pb-6 sm:pb-8">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">
                    [ EVALUATION ]
                  </span>
                  <span className="h-px w-8 bg-[#262626]" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
                  <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none text-[#FAFAFA]">
                    QUIZZES.
                  </h1>
                  <PrimaryButton onClick={openNewDeckSetup} className="sm:w-auto w-full justify-center">
                    <Plus className="w-4 h-4 mr-2" />
                    CREATE DECK
                  </PrimaryButton>
                </div>
              </motion.div>

              <motion.div variants={fadeUp} className="space-y-6">
                <AnimatePresence>
                  {libraryError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="border border-[#FF3D00] bg-[#FF3D00]/5 p-4 text-[10px] font-bold tracking-widest text-[#FF3D00] uppercase">
                        [ ERROR ] {libraryError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isLibraryLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="h-[200px] sm:h-[300px] bg-[#0A0A0A] border-b border-r border-[#262626] animate-pulse" />
                    ))}
                  </div>
                ) : libraryCards.length === 0 ? (
                  <div className="border border-[#262626] bg-[#0A0A0A] p-8 sm:p-12 md:p-24 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 border border-[#262626] mb-6 sm:mb-8 flex items-center justify-center text-[#737373]">
                      <BookOpen className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-black tracking-widest text-[#FAFAFA] uppercase mb-4">
                      NO DEPOSITORIES FOUND.
                    </h3>
                    <p className="text-[10px] tracking-widest text-[#737373] uppercase mb-8 max-w-xs">
                      INITIALIZE YOUR FIRST QUIZ DECK FROM NOTES OR FLASHCARDS.
                    </p>
                    <PrimaryButton onClick={openNewDeckSetup}>
                      <Plus className="w-4 h-4 mr-2" /> NEW DECK
                    </PrimaryButton>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#262626]">
                    {libraryCards.map((deck) => {
                      const completed = Boolean(deck.completedAt);
                      const metrics = getDeckMetrics(deck);
                      const grade = getGrade(deck.score || 0);
                      return (
                        <div
                          key={deck._id}
                          className="group relative border-b border-r border-[#262626] p-5 sm:p-8 cursor-pointer overflow-hidden flex flex-col min-h-[180px] sm:min-h-[250px] lg:min-h-[300px]"
                          onClick={() => handleOpenDeckDetail(deck)}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); void handleDeleteDeck(deck); }}
                        >
                          <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                          <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                            <div className="flex-1">
                              <h3 className="text-sm sm:text-lg font-black tracking-widest uppercase truncate mb-2">
                                {deck.deckName || `${deck.subject} QUIZ`}
                              </h3>
                              <p className="text-[10px] tracking-widest text-[#737373] group-hover:text-[#0A0A0A]/70 uppercase truncate">
                                {deck.subject}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-[#262626] group-hover:border-[#0A0A0A]/20">
                              <span className={cn(
                                "text-[10px] font-bold tracking-widest uppercase group-hover:text-[#0A0A0A]",
                                completed ? grade.color : "text-inherit",
                              )}>
                                [{completed ? "DONE" : "PENDING"}]
                              </span>
                              <span className="text-[10px] tracking-widest text-[#737373] group-hover:text-[#0A0A0A]/70 uppercase">
                                {metrics.total} Qs
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* ── DECK DETAIL VIEW ── */}
          {view === "deck-detail" && selectedDeckForDetail && (
            <motion.div key="deck-detail" variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-8 sm:gap-12 max-w-4xl mx-auto w-full">
              <motion.div variants={fadeUp}>
                <GhostButton onClick={handleBackToLibrary} className="pl-0 hover:pl-2">
                  <ArrowLeft className="w-4 h-4 mr-2" /> BACK
                </GhostButton>
              </motion.div>

              {isDeckDetailLoading ? (
                <div className="border border-[#262626] bg-[#0A0A0A] p-8 animate-pulse h-48" />
              ) : (
                <>
                  <motion.div variants={fadeUp} className="border border-[#262626] bg-[#0A0A0A] p-5 sm:p-8 md:p-12 flex flex-col gap-6 sm:gap-8">
                    <div>
                      <h2 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tighter text-[#FAFAFA] uppercase leading-none mb-3">
                        {selectedDeckForDetail.deckName || `${selectedDeckForDetail.subject} QUIZ`}
                      </h2>
                      <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">
                        SUBJECT: {selectedDeckForDetail.subject}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-[10px] font-bold tracking-widest uppercase text-[#737373] border-t border-[#262626] pt-5 sm:pt-8">
                      <span className={Boolean(selectedDeckForDetail.completedAt) ? getGrade(selectedDeckForDetail.score || 0).color : ""}>
                        STATUS: {Boolean(selectedDeckForDetail.completedAt) ? "COMPLETED" : "PENDING"}
                      </span>
                      <span>//</span>
                      <span>{getDeckMetrics(selectedDeckForDetail).total} QUESTIONS</span>
                    </div>

                    {Boolean(selectedDeckForDetail.completedAt) && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 pt-2">
                        {[
                          { label: "SCORE", value: `${selectedDeckForDetail.score || 0}%`, color: "text-[#FAFAFA]" },
                          { label: "CORRECT", value: `${getDeckMetrics(selectedDeckForDetail).correct}/${getDeckMetrics(selectedDeckForDetail).answered}`, color: "text-[#FAFAFA]" },
                          { label: "WRONG", value: `${getDeckMetrics(selectedDeckForDetail).incorrect}`, color: "text-[#FF3D00]" },
                          { label: "TIME", value: `${Math.floor((selectedDeckForDetail.timeTaken || 0) / 60)}M ${(selectedDeckForDetail.timeTaken || 0) % 60}S`, color: "text-[#FAFAFA]" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="border border-[#262626] bg-[#0A0A0A] p-4 sm:p-6 text-center">
                            <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase mb-3">{label}</p>
                            <p className={cn("text-lg sm:text-2xl font-black", color)}>{value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <PrimaryButton
                      onClick={() => void handleStartDeckQuiz(selectedDeckForDetail._id)}
                      className="w-full mt-2"
                    >
                      {Boolean(selectedDeckForDetail.completedAt) ? "RETAKE EVALUATION" : "COMMENCE EVALUATION"}
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </PrimaryButton>
                  </motion.div>

                  {Boolean(selectedDeckForDetail.completedAt) && (
                    <motion.div variants={fadeUp} className="space-y-4 sm:space-y-6">
                      <h3 className="text-lg sm:text-xl font-black tracking-widest text-[#FAFAFA] uppercase border-b border-[#262626] pb-4">
                        REVIEW LOG.
                      </h3>
                      <div className="space-y-3 sm:space-y-4">
                        {getDeckReviewRows(selectedDeckForDetail).map((row, idx) => (
                          <div key={idx} className="border border-[#262626] bg-[#0A0A0A]">
                            <button
                              onClick={() => setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                              className="w-full text-left p-4 sm:p-6 flex items-center justify-between gap-4 hover:bg-[#FAFAFA]/5 transition-colors"
                            >
                              <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                                {row.isCorrect
                                  ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#FAFAFA] mt-0.5 shrink-0" />
                                  : <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF3D00] mt-0.5 shrink-0" />
                                }
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase mb-1">
                                    [ Q{idx + 1} ]
                                  </p>
                                  <p className="text-xs sm:text-sm text-[#737373] truncate">{row.question}</p>
                                </div>
                              </div>
                              <ChevronDown className={cn("w-4 h-4 text-[#737373] transition-transform shrink-0", expandedRows[idx] && "rotate-180")} />
                            </button>
                            <AnimatePresence>
                              {expandedRows[idx] && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-[#262626]"
                                >
                                  <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 bg-[#0A0A0A]">
                                    <p className="text-sm sm:text-lg text-[#FAFAFA] leading-relaxed">{row.question}</p>
                                    {!row.isCorrect && (
                                      <div className="border border-[#262626] p-4 text-xs font-bold tracking-widest text-[#FAFAFA] uppercase">
                                        <span className="text-[#FF3D00] mr-2">REQUIRED:</span>
                                        {row.options[row.correctIndex]}
                                      </div>
                                    )}
                                    <p className="text-xs sm:text-sm text-[#737373] leading-relaxed italic border-l-2 border-[#262626] pl-4">
                                      {row.explanation}
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ── ACTIVE QUIZ VIEW ── */}
          {view === "quiz" && currentQuiz && (
            <motion.div key="quiz" variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6 sm:gap-8 max-w-3xl mx-auto w-full">
              <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:gap-6">
                <div className="flex items-center justify-between border-b border-[#262626] pb-4 sm:pb-6">
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">
                      Q {questionIndex + 1} / {currentQuiz.questions.length}
                    </p>
                    {/* Progress dots — scroll on mobile if many questions */}
                    <div className="flex items-center gap-1 overflow-x-auto max-w-[180px] sm:max-w-none">
                      {currentQuiz.questions.map((_, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "shrink-0 h-1 transition-colors",
                            currentQuiz.questions.length > 10 ? "w-4" : "w-6 sm:w-8",
                            idx <= questionIndex ? "bg-[#FAFAFA]" : "bg-[#262626]",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Timer */}
                  <div className="flex items-center gap-2 sm:gap-3 border border-[#262626] px-3 py-1.5 sm:px-4 sm:py-2">
                    <Clock3 className={cn("w-3 h-3 sm:w-4 sm:h-4", timeLeft < 10 ? "text-[#FF3D00]" : "text-[#737373]")} />
                    <span className={cn("text-xs font-black tracking-widest", timeLeft < 10 ? "text-[#FF3D00]" : "text-[#FAFAFA]")}>
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={fadeUp} className="border border-[#262626] bg-[#0A0A0A] p-5 sm:p-8 md:p-12">
                <p className="text-lg sm:text-2xl md:text-3xl font-black text-[#FAFAFA] leading-tight mb-6 sm:mb-10 md:mb-12">
                  {currentQuiz.questions[questionIndex].question}
                </p>

                <div className="space-y-3 sm:space-y-4">
                  {currentQuiz.questions[questionIndex].options.map((option, idx) => {
                    const selected = answers[questionIndex] ?? -1;
                    const isSelected = selected === idx;
                    const isCorrectOption = currentQuiz.questions[questionIndex].correctAnswer === idx;
                    const answered = selected !== -1;

                    let buttonClass = "border border-[#262626] bg-transparent text-[#FAFAFA] hover:border-[#FAFAFA]";
                    if (answered) {
                      if (isCorrectOption) buttonClass = "border border-[#FAFAFA] bg-[#FAFAFA] text-[#0A0A0A]";
                      else if (isSelected && !isCorrectOption) buttonClass = "border border-[#FF3D00] bg-transparent text-[#FF3D00]";
                      else buttonClass = "border border-[#262626] bg-transparent text-[#737373] opacity-50";
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => { if (selected === -1) setAnswer(questionIndex, idx); }}
                        disabled={answered}
                        className={cn(
                          "w-full text-left p-4 sm:p-6 md:p-8 flex items-center justify-between transition-all duration-300",
                          buttonClass,
                        )}
                      >
                        <span className="text-xs sm:text-sm font-bold tracking-widest uppercase leading-relaxed flex items-start gap-3 sm:gap-4">
                          <span className={cn("w-5 font-black opacity-50 shrink-0", answered && isCorrectOption ? "text-[#0A0A0A]" : "")}>
                            {idx + 1}.
                          </span>
                          {option}
                        </span>
                        {answered && isCorrectOption && <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />}
                        {answered && isSelected && !isCorrectOption && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {answers[questionIndex] !== undefined && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      className="overflow-hidden mt-6 sm:mt-8"
                    >
                      <div className="border border-[#262626] p-4 sm:p-6 bg-[#FAFAFA]/5">
                        <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase mb-3">[ ANALYSIS ]</p>
                        <p className="text-xs sm:text-sm text-[#FAFAFA] leading-relaxed italic">
                          {currentQuiz.questions[questionIndex].explanation}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <AnimatePresence>
                {answers[questionIndex] !== undefined && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
                    {questionIndex < currentQuiz.questions.length - 1 ? (
                      <PrimaryButton onClick={() => setQuestionIndex((idx) => idx + 1)} className="w-full sm:w-auto">
                        PROCEED <ChevronRight className="w-4 h-4 ml-2" />
                      </PrimaryButton>
                    ) : (
                      <PrimaryButton
                        onClick={() => void handleFinishQuiz()} disabled={isSubmitting}
                        className="w-full sm:w-auto"
                      >
                        {isSubmitting ? "PROCESSING..." : "CONCLUDE"}
                      </PrimaryButton>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── RESULTS VIEW ── */}
          {view === "results" && currentQuiz && results && (
            <motion.div key="results" variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-8 sm:gap-12 max-w-4xl mx-auto w-full">
              <motion.div variants={fadeUp}>
                <GhostButton onClick={handleBackToLibrary} className="pl-0 hover:pl-2">
                  <ArrowLeft className="w-4 h-4 mr-2" /> BACK TO LIBRARY
                </GhostButton>
              </motion.div>

              <motion.div variants={fadeUp} className="border border-[#262626] bg-[#0A0A0A] p-8 sm:p-12 md:p-24 flex flex-col items-center text-center">
                <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase mb-6 sm:mb-8">
                  [ SCORE RECORDED ]
                </p>
                <h1 className="text-7xl sm:text-8xl md:text-9xl font-black text-[#FAFAFA] leading-none tracking-tighter mb-6 sm:mb-8">
                  <AnimatedScore value={results.score} />%
                </h1>
                <div className={cn(
                  "border px-6 sm:px-8 py-3 sm:py-4 text-xl sm:text-2xl font-black uppercase tracking-widest mb-6 sm:mb-8",
                  results.score >= 70 ? "border-[#262626] text-[#FAFAFA]" : "border-[#FF3D00] text-[#FF3D00]",
                )}>
                  GRADE {getGrade(results.score).letter}
                </div>
                <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">
                  TIME: {Math.floor(results.timeTaken / 60)}M {results.timeTaken % 60}S
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="space-y-4 sm:space-y-6">
                <h3 className="text-lg sm:text-xl font-black tracking-widest text-[#FAFAFA] uppercase border-b border-[#262626] pb-4">
                  PERFORMANCE LOG.
                </h3>
                <div className="space-y-3 sm:space-y-4">
                  {results.questionResults.map((row, idx) => (
                    <div key={idx} className="border border-[#262626] bg-[#0A0A0A]">
                      <button
                        onClick={() => setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                        className="w-full text-left p-4 sm:p-6 flex items-center justify-between gap-4 hover:bg-[#FAFAFA]/5 transition-colors"
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          {row.isCorrect
                            ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#FAFAFA] shrink-0" />
                            : <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF3D00] shrink-0" />
                          }
                          <p className="text-[10px] sm:text-xs font-bold tracking-widest text-[#FAFAFA] uppercase">
                            [ Q{idx + 1} ]
                          </p>
                        </div>
                        <ChevronDown className={cn("w-4 h-4 text-[#737373] transition-transform shrink-0", expandedRows[idx] && "rotate-180")} />
                      </button>
                      <AnimatePresence>
                        {expandedRows[idx] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-[#262626]"
                          >
                            <div className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 bg-[#0A0A0A]">
                              <p className="text-sm sm:text-lg text-[#FAFAFA] leading-relaxed">{row.question}</p>
                              {!row.isCorrect && (
                                <div className="border border-[#262626] p-4 text-xs font-bold tracking-widest text-[#FAFAFA] uppercase">
                                  <span className="text-[#FF3D00] mr-2">REQUIRED:</span>
                                  {row.options[row.correctIndex]}
                                </div>
                              )}
                              <p className="text-xs sm:text-sm text-[#737373] leading-relaxed italic border-l-2 border-[#262626] pl-4">
                                {row.explanation}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>

              {(() => {
                const weakTopicCounts = results.questionResults
                  .filter((row) => !row.isCorrect)
                  .reduce<Record<string, number>>((acc, row) => {
                    const key = row.concept || "GENERAL";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {});
                const weakTopicsList = Object.entries(weakTopicCounts).sort((a, b) => (b[1] as number) - (a[1] as number));
                if (weakTopicsList.length === 0) return null;

                return (
                  <motion.div variants={fadeUp} className="space-y-4 sm:space-y-6 mt-4 sm:mt-8">
                    <h3 className="text-lg sm:text-xl font-black tracking-widest text-[#FF3D00] uppercase border-b border-[#FF3D00]/50 pb-4">
                      WEAKNESS DETECTED.
                    </h3>
                    <div className="grid gap-3 sm:gap-4">
                      {weakTopicsList.map(([topicName, misses]) => (
                        <div key={topicName} className="border border-[#262626] bg-[#0A0A0A] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                          <div>
                            <p className="text-xs sm:text-sm font-bold tracking-widest text-[#FAFAFA] uppercase mb-1">
                              {topicName}
                            </p>
                            <p className="text-[10px] tracking-widest text-[#FF3D00] uppercase">
                              [{misses} ERROR{(misses as number) > 1 ? "S" : ""}]
                            </p>
                          </div>
                          <PrimaryButton
                            onClick={() => navigate(`/tutor?topic=${encodeURIComponent(topicName)}&context=quiz_weakness`)}
                            className="self-start sm:self-auto"
                          >
                            <Brain className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">DEPLOY AI TUTOR</span>
                            <span className="sm:hidden">AI TUTOR</span>
                          </PrimaryButton>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}

              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 sm:gap-4 pt-6 sm:pt-8 border-t border-[#262626] justify-end">
                <PrimaryButton onClick={openNewDeckSetup}>
                  <Plus className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">INITIALIZE NEW DECK</span>
                  <span className="sm:hidden">NEW DECK</span>
                </PrimaryButton>
                {selectedDeckForDetailId && (
                  <GhostButton onClick={() => { setView("deck-detail"); void loadDeckDetail(selectedDeckForDetailId); }}>
                    <span className="hidden sm:inline">RETURN TO DECK LISTING</span>
                    <span className="sm:hidden">VIEW DECK</span>
                  </GhostButton>
                )}
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {renderNewDeckModal()}
    </PageWrapper>
  );
}