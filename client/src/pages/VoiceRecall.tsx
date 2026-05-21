import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, RotateCw, Play, ArrowRight, Search, Pencil } from "lucide-react";
import axios from "@/lib/axios";
import { guardOpenRouterAction } from "@/lib/apiKeyGate";
import { cn } from "@/lib/utils";
import { useVoiceRecallStore } from "@/store/voiceRecallStore";
import { useRateLimitStore } from "@/store/rateLimitStore";

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
      "bg-transparent px-4 py-3",
      "text-[10px] font-bold tracking-widest text-[#737373] uppercase",
      "hover:text-[#FAFAFA] transition-colors disabled:opacity-50 disabled:pointer-events-none",
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

// ── Sound Wave ──────────────────────────────────────────────

function SoundWave({ bars = 5, className }: { bars?: number; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-[3px]", className)}>
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] bg-[#FAFAFA] rounded-none"
          animate={{ height: [4, 16, 4] }}
          transition={{ duration: 0.5, delay: i * 0.08, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Animated Number ─────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) { setDisplay(value); clearInterval(interval); }
      else setDisplay(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  return <span>{display.toString().padStart(2, "00")}</span>;
}

// ── Score Ring ──────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 60 ? "#FF3D00" : "#737373";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#262626" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="square"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.8, ease: easing }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tracking-tighter"
          style={{ color: score >= 60 ? "#FAFAFA" : "#737373" }}
        >
          {score.toString().padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// ── Performance Label ───────────────────────────────────────

function getPerformanceLabel(score: number): string {
  if (score >= 90) return "OUTSTANDING";
  if (score >= 75) return "WELL DONE";
  if (score >= 60) return "GOOD EFFORT";
  return "KEEP PRACTICING";
}

// ── Countdown Timer ─────────────────────────────────────────

const QUESTION_TIME_LIMIT = 60;

function CountdownTimer({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - secondsLeft / total);
  const isUrgent = secondsLeft <= 10;
  const color = isUrgent ? "#FF3D00" : "#FAFAFA";

  return (
    <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
      <svg className="-rotate-90" width={44} height={44} viewBox="0 0 44 44">
        <circle cx={22} cy={22} r={radius} fill="none" stroke="#262626" strokeWidth={2} />
        <circle
          cx={22} cy={22} r={radius} fill="none"
          stroke={color} strokeWidth={2} strokeLinecap="square"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <span
        className={cn("absolute text-[10px] font-bold tracking-tighter tabular-nums", isUrgent && "text-[#FF3D00]")}
        style={{ color }}
      >
        {secondsLeft.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 1: SETUP SCREEN
// ──────────────────────────────────────────────────────────

function SetupScreen() {
  const navigate = useNavigate();
  const {
    selectedNoteId, questionCount, notes, isLoadingNotes, isGenerating,
    fetchNotes, setSelectedNote, setQuestionCount, startSession,
  } = useVoiceRecallStore();

  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleStart = async () => {
    if (!selectedNoteId) return;
    if (guardOpenRouterAction()) return;
    await startSession();
  };

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl pb-12 sm:pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-16 lg:gap-24">

        {/* Left: Note selector */}
        <motion.div variants={fadeUp} className="col-span-1 lg:col-span-8 space-y-8 sm:space-y-12">
          <section>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">1. SELECT SOURCE</h2>
              <div className="h-[1px] flex-1 bg-[#262626]" />
              <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                {notes.length.toString().padStart(2, "0")} NOTES
              </span>
            </div>

            <div className="mb-5 sm:mb-6">
              <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
                SEARCH KNOWLEDGE BASE
              </label>
              <div className="relative">
                <Search className="absolute left-0 top-0 mt-3 w-4 h-4 text-[#737373]" />
                <input
                  placeholder="FILTER BY TITLE OR SUBJECT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-b border-[#262626] pb-3 pt-2 pl-8 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase rounded-none"
                />
              </div>
            </div>

            {isLoadingNotes ? (
              <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l border-[#262626]">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 sm:h-32 border-b border-r border-[#262626] bg-[#0A0A0A] animate-pulse" />
                ))}
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="border border-[#262626] p-8 sm:p-16 flex flex-col items-center text-center">
                <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">VOID.</h3>
                <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
                  NO KNOWLEDGE BASE FOUND.
                </p>
                <SecondaryButton onClick={() => navigate("/workspace")}>
                  OPEN WORKSPACE <ArrowRight className="w-4 h-4 ml-1" />
                </SecondaryButton>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l border-[#262626]">
                {filteredNotes.map((note) => (
                  <div
                    key={note._id}
                    className={cn(
                      "group relative border-b border-r border-[#262626] p-4 sm:p-6 cursor-pointer overflow-hidden flex flex-col min-h-[120px] sm:min-h-[160px]",
                      selectedNoteId === note._id ? "bg-[#1A1A1A]" : "bg-transparent"
                    )}
                    onClick={() => setSelectedNote(note._id)}
                  >
                    {(!selectedNoteId || selectedNoteId !== note._id) && (
                      <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                    )}
                    <div className={cn(
                      "relative z-10 flex-1 flex flex-col transition-colors duration-500",
                      selectedNoteId === note._id ? "text-[#FAFAFA]" : "group-hover:text-[#0A0A0A] text-[#737373]"
                    )}>
                      <h4 className={cn(
                        "text-base sm:text-lg font-bold tracking-tight mb-2 uppercase line-clamp-2",
                        selectedNoteId === note._id ? "text-[#FF3D00]" : "text-[#FAFAFA] group-hover:text-[#0A0A0A]"
                      )}>
                        {note.title}
                      </h4>
                      <p className="text-xs font-bold tracking-[0.2em] uppercase mt-auto opacity-70">
                        {note.subject || "GENERAL"}
                        {note.tags?.length > 0 && ` · ${note.tags[0]}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </motion.div>

        {/* Right: Config */}
        <motion.div variants={fadeUp} className="col-span-1 lg:col-span-4 space-y-8 sm:space-y-12">
          <section>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">2. SETUP</h2>
              <div className="h-[1px] flex-1 bg-[#262626]" />
            </div>

            <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
              QUESTIONS COUNT
            </label>
            <div className="grid grid-cols-4 border-t border-l border-[#262626] mb-8 sm:mb-12">
              {[3, 5, 8, 10].map((count) => (
                <button
                  key={count}
                  onClick={() => setQuestionCount(count)}
                  className={cn(
                    "border-b border-r border-[#262626] p-3 sm:p-4 text-center text-base sm:text-lg font-bold tracking-tighter transition-colors",
                    questionCount === count
                      ? "bg-[#FAFAFA] text-[#0A0A0A]"
                      : "bg-[#0A0A0A] text-[#737373] hover:text-[#FAFAFA]"
                  )}
                >
                  {count}
                </button>
              ))}
            </div>

            <div className="border border-[#262626] p-4 sm:p-6 mb-6 sm:mb-8">
              <Mic className="w-5 h-5 text-[#FF3D00] mb-3 sm:mb-4" />
              <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase leading-relaxed">
                MICROPHONE STREAM REQUIRED.<br />
                SPEAK CLEARLY.<br />
                NO HESITATION.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:gap-4">
              <SecondaryButton
                onClick={handleStart}
                disabled={!selectedNoteId || isGenerating}
                className="w-full justify-between"
              >
                {isGenerating ? (
                  <span className="flex items-center">
                    <RotateCw className="w-4 h-4 mr-2 animate-spin" /> GENERATING...
                  </span>
                ) : (
                  <span className="flex items-center">
                    BEGIN SESSION <Play className="w-4 h-4 ml-2" />
                  </span>
                )}
              </SecondaryButton>
              <GhostButton onClick={() => navigate("/")} className="w-full justify-center">
                ABORT
              </GhostButton>
            </div>
          </section>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 2: SESSION SCREEN
// ──────────────────────────────────────────────────────────

function SessionScreen() {
  const {
    questions,
    currentQuestionIndex,
    isEvaluating,
    submitAnswer,
    skipQuestion,
  } = useVoiceRecallStore();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(QUESTION_TIME_LIMIT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoSubmitted = useRef(false);

  useEffect(() => { setEditedTranscript(transcript); setIsEditing(false); }, [transcript]);

  useEffect(() => {
    setTranscript(""); setEditedTranscript(""); setIsEditing(false);
    setIsRecording(false); setIsTranscribing(false);
  }, [currentQuestionIndex]);

  useEffect(() => {
    setSecondsLeft(QUESTION_TIME_LIMIT);
    hasAutoSubmitted.current = false;
  }, [currentQuestionIndex]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => { if (prev <= 1) return 0; return prev - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (secondsLeft === 0 && !hasAutoSubmitted.current && !isEvaluating) {
      hasAutoSubmitted.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (editedTranscript.trim()) submitAnswer(editedTranscript);
      else skipQuestion();
    }
  }, [secondsLeft, isEvaluating, editedTranscript, submitAnswer, skipQuestion]);

  const currentQuestion = questions[currentQuestionIndex];
  const hasTranscript = editedTranscript.trim().length > 0 || transcript.trim().length > 0;

  if (!currentQuestion) return null;

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start(100);
      setIsRecording(true); setTranscript(""); setEditedTranscript("");
    } catch (err) { console.error("Mic error:", err); }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    setIsRecording(false); setIsTranscribing(true);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current.stop();
    await new Promise<void>((resolve) => { mediaRecorderRef.current!.onstop = () => resolve(); });
    try {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      if (blob.size < 1000) { setIsTranscribing(false); return; }
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const store = useVoiceRecallStore.getState();
      const note = store.notes.find((n) => n._id === store.selectedNoteId);
      if (note?.subject) formData.append("subject", note.subject);
      const response = await axios.post("/voice/transcribe", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (response.data.transcript) setTranscript(response.data.transcript);
    } catch (err) { console.error("Transcription error:", err); }
    finally { setIsTranscribing(false); }
  };

  const toggleRecording = () => { if (isRecording) stopRecording(); else startRecording(); };

  const stopRecordingIfActive = () => {
    if (isRecording) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setIsRecording(false); setIsTranscribing(false);
    }
  };

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopRecordingIfActive();
    const answer = editedTranscript.trim() || transcript.trim();
    if (answer) { await submitAnswer(answer); setTranscript(""); setEditedTranscript(""); }
  };

  const handleSkip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopRecordingIfActive();
    setTranscript(""); setEditedTranscript(""); skipQuestion();
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    return (
      <div className="flex justify-center items-center border border-[#FF3D00] p-6 sm:p-8 text-center text-[#FF3D00] font-bold tracking-[0.2em] uppercase max-w-2xl mx-auto">
        MICROPHONE NOT SUPPORTED BY HARDWARE/BROWSER.
      </div>
    );
  }

  return (
    <>
      {/* ── SCROLLABLE CONTENT ── */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        // ↓ pb-36 clears the fixed bottom bar
        className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-36"
      >
        {/* PROGRESS + TIMER */}
        <motion.div
          variants={fadeUp}
          className="flex items-center justify-between gap-4 border-b border-[#262626] pb-5 sm:pb-6"
        >
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block mb-2">
              <span className="sm:hidden">Q {currentQuestionIndex + 1}/{questions.length}</span>
              <span className="hidden sm:inline">PROGRESS {currentQuestionIndex + 1} OF {questions.length}</span>
            </span>
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              {questions.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "shrink-0 h-[3px] rounded-none transition-all duration-300",
                    questions.length > 6 ? "w-5 sm:w-8" : "w-8",
                    idx === currentQuestionIndex
                      ? "bg-[#FF3D00] w-10 sm:w-14"
                      : idx < currentQuestionIndex
                      ? "bg-[#FAFAFA]"
                      : "bg-[#262626]"
                  )}
                />
              ))}
            </div>
          </div>
          <CountdownTimer secondsLeft={secondsLeft} total={QUESTION_TIME_LIMIT} />
        </motion.div>

        {/* QUESTION CARD */}
        <motion.div
          variants={fadeUp}
          className="border border-[#262626] p-5 sm:p-8 md:p-12 relative bg-[#0A0A0A] overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-16 h-[3px] bg-[#FF3D00]" />
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-tight mb-8 sm:mb-12 mt-3">
            {currentQuestion.question}
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 border-t border-[#262626] pt-4 sm:pt-6">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737373]">
              DIFFICULTY: <span className="text-[#FAFAFA] ml-1">{currentQuestion.difficulty}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {currentQuestion.keyPoints.map((point, idx) => (
                <span
                  key={idx}
                  className="text-[#737373] text-[10px] uppercase font-bold tracking-widest px-2 py-1 border border-[#262626]"
                >
                  {point}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* TRANSCRIPT PANEL */}
        <AnimatePresence>
          {(transcript || editedTranscript) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.3, ease: easing }}
              className="border border-[#262626] bg-[#0A0A0A] overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-[#111111]">
                <div className="flex items-center gap-2">
                  <span className="w-[6px] h-[6px] rounded-full bg-[#FF3D00]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#737373]">
                    TRANSCRIPT DATA
                  </span>
                </div>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-[#737373] hover:text-[#FF3D00] uppercase transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  {isEditing ? "LOCK" : "EDIT"}
                </button>
              </div>
              <div className="p-4 sm:p-5">
                {isEditing ? (
                  <textarea
                    value={editedTranscript}
                    onChange={(e) => setEditedTranscript(e.target.value)}
                    className="w-full bg-transparent text-sm font-mono text-[#FAFAFA] resize-y min-h-[80px] outline-none leading-relaxed"
                    autoFocus
                    onBlur={() => setIsEditing(false)}
                  />
                ) : (
                  <p className="text-sm font-mono text-[#FAFAFA] whitespace-pre-wrap leading-relaxed">
                    {editedTranscript || transcript}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>

      {/* ── FIXED BOTTOM CONTROL BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50">

        {/* Recording indicator stripe */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              className="h-[2px] bg-[#FF3D00] origin-left w-full"
            />
          )}
        </AnimatePresence>

        <div className="border-t border-[#262626] bg-[#0A0A0A]/95 backdrop-blur-md">
          <div className="max-w-4xl mx-auto px-4 sm:px-8">
            <div className="flex items-center justify-between h-20 sm:h-24 relative">

              {/* ── LEFT: Skip / Don't Know ── */}
              <div className="flex-1 flex justify-start">
                <button
                  onClick={handleSkip}
                  disabled={isEvaluating}
                  className="group flex flex-col items-start gap-1 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-[#FAFAFA] uppercase transition-colors leading-none">
                    <span className="sm:hidden">SKIP</span>
                    <span className="hidden sm:inline">I DON'T KNOW</span>
                  </span>
                  <span className="h-[1px] w-0 group-hover:w-full bg-[#737373] transition-all duration-300" />
                </button>
              </div>

              {/* ── CENTER: Mic Button (elevated) ── */}
              <div className="flex-shrink-0 flex items-center justify-center">
                <div className="relative flex items-center justify-center">

                  {/* Pulsing rings when recording */}
                  <AnimatePresence>
                    {isRecording && (
                      <>
                        <motion.span
                          className="absolute rounded-full border border-[#FF3D00]/40"
                          initial={{ width: 64, height: 64, opacity: 0.8 }}
                          animate={{ width: 90, height: 90, opacity: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                        />
                        <motion.span
                          className="absolute rounded-full border border-[#FF3D00]/25"
                          initial={{ width: 64, height: 64, opacity: 0.6 }}
                          animate={{ width: 110, height: 110, opacity: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.2, delay: 0.3, repeat: Infinity, ease: "easeOut" }}
                        />
                      </>
                    )}
                  </AnimatePresence>

                  {/* Mic circle */}
                  <motion.button
                    onClick={toggleRecording}
                    disabled={isEvaluating || isTranscribing}
                    whileTap={{ scale: 0.92 }}
                    className={cn(
                      "relative z-10 w-16 h-16 sm:w-18 sm:h-18 rounded-full flex flex-col items-center justify-center",
                      "border-2 transition-all duration-300 shadow-lg",
                      // ↓ elevated above bar
                      "-mt-8 sm:-mt-10",
                      isRecording
                        ? "bg-[#FF3D00] border-[#FF3D00] text-[#0A0A0A]"
                        : isTranscribing
                        ? "bg-[#0A0A0A] border-[#262626] text-[#737373] cursor-not-allowed"
                        : "bg-[#FAFAFA] border-[#FAFAFA] text-[#0A0A0A] hover:bg-[#FF3D00] hover:border-[#FF3D00] hover:text-[#FAFAFA]",
                      "disabled:opacity-50 disabled:pointer-events-none"
                    )}
                  >
                    {isTranscribing ? (
                      <RotateCw className="w-5 h-5 animate-spin" />
                    ) : isRecording ? (
                      <SoundWave bars={3} className="gap-[2px]" />
                    ) : (
                      <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </motion.button>
                </div>
              </div>

              {/* ── RIGHT: Submit Answer ── */}
              <div className="flex-1 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={isEvaluating || !hasTranscript}
                  className="group flex flex-col items-end gap-1 disabled:opacity-30 disabled:pointer-events-none"
                >
                  {isEvaluating ? (
                    <span className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                      <RotateCw className="w-3 h-3 animate-spin" />
                      <span className="hidden sm:inline">EVALUATING...</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] group-hover:text-[#FAFAFA] uppercase transition-colors leading-none">
                      <span className="sm:hidden">SUBMIT</span>
                      <span className="hidden sm:inline">SUBMIT ANSWER</span>
                    </span>
                  )}
                  <span className="h-[1px] w-0 group-hover:w-full bg-[#FF3D00] transition-all duration-300 self-end" />
                </button>
              </div>

            </div>

            {/* Recording label */}
            <div className="flex justify-center pb-3 -mt-1 h-5">
              {isRecording && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[9px] font-bold tracking-[0.25em] text-[#FF3D00] uppercase animate-pulse"
                >
                  ● RECORDING — TAP TO STOP
                </motion.span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 3: FEEDBACK SCREEN
// ──────────────────────────────────────────────────────────

function FeedbackScreen() {
  const { responses, nextQuestion, isEvaluating } = useVoiceRecallStore();
  const lastResponse = responses[responses.length - 1];

  if (!lastResponse) return null;

  const { score, whatWasCorrect, whatWasMissed, improvement } = lastResponse.evaluation;
  const displayVerdict = lastResponse.verdict || "UNKNOWN";

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto space-y-8 sm:space-y-12 md:space-y-16 pb-12 sm:pb-20"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-8 border-b border-[#262626] pb-8 sm:pb-12">
        <motion.div variants={fadeUp}>
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
            EVALUATION REPORT
          </span>
          <h2 className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter uppercase text-[#FAFAFA] leading-none">
            {displayVerdict}
          </h2>
        </motion.div>
        <motion.div variants={fadeUp} className="shrink-0 flex items-center justify-center sm:justify-end">
          <ScoreRing score={score} size={110} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-[#262626]">
        {whatWasCorrect && (
          <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#262626] px-3 py-1 mb-4 sm:mb-6 inline-block">
              POSITIVES
            </span>
            <p className="text-sm font-medium text-[#FAFAFA] leading-relaxed uppercase tracking-wide">
              {whatWasCorrect}
            </p>
          </motion.div>
        )}

        {whatWasMissed && whatWasMissed.length > 0 && (
          <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#FF3D00] px-3 py-1 mb-4 sm:mb-6 inline-block">
              OMISSIONS
            </span>
            <div className="space-y-3 sm:space-y-4">
              {whatWasMissed.map((item, idx) => (
                <div key={idx} className="flex gap-3 sm:gap-4">
                  <span className="text-[#FF3D00] font-bold shrink-0">×</span>
                  <span className="text-sm text-[#737373] uppercase tracking-wide leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {lastResponse.evaluation.speechCorrections?.length > 0 && (
          <motion.div
            variants={fadeUp}
            className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 col-span-1 sm:col-span-2 bg-[#0A0A0A]"
          >
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#262626] px-3 py-1 mb-4 sm:mb-6 inline-block">
              SPEECH MISMATCHES
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {lastResponse.evaluation.speechCorrections.map((correction, idx) => (
                <div
                  key={idx}
                  className="border border-[#262626] p-3 sm:p-4 text-xs font-mono uppercase tracking-widest flex items-center justify-between gap-2"
                >
                  <span className="text-[#737373] line-through truncate">{correction.heard}</span>
                  <ArrowRight className="w-3 h-3 text-[#FAFAFA] shrink-0" />
                  <span className="text-[#FF3D00] font-bold truncate">{correction.intended}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {improvement && (
          <motion.div
            variants={fadeUp}
            className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 col-span-1 sm:col-span-2"
          >
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#262626] px-3 py-1 mb-4 sm:mb-6 inline-block">
              IMPROVEMENT VECTOR
            </span>
            <p className="text-base sm:text-lg font-bold tracking-tight text-[#FF3D00] uppercase leading-relaxed max-w-2xl">
              {improvement}
            </p>
          </motion.div>
        )}
      </div>

      <motion.div variants={fadeUp} className="flex justify-end pt-6 sm:pt-8">
        <PrimaryButton onClick={nextQuestion} disabled={isEvaluating}>
          {isEvaluating ? "PROCESSING..." : "NEXT ITEM"}
          <ArrowRight className="w-4 h-4 ml-1" />
        </PrimaryButton>
      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 4: COMPLETE SCREEN
// ──────────────────────────────────────────────────────────

function CompleteScreen() {
  const navigate = useNavigate();
  const { responses, weakConcepts, avgScore, endSession, resetSession, isSaving } = useVoiceRecallStore();

  const confidentAnswers = responses.filter((r) => r.evaluation).length;

  const handleCreateTutorSession = () => {
    const topicList = weakConcepts.slice(0, 5).join(",");
    navigate(`/tutor?topics=${encodeURIComponent(topicList)}`);
  };

  useEffect(() => { endSession(); }, [endSession]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto pb-12 sm:pb-20"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#262626] pb-10 sm:pb-16 mb-8 sm:mb-16 gap-6 sm:gap-8">
        <motion.div variants={fadeUp}>
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
            SESSION TERMINATED
          </span>
          <h2 className="text-4xl sm:text-6xl md:text-8xl lg:text-[7rem] font-bold tracking-tighter uppercase text-[#FAFAFA] leading-none mb-4">
            {getPerformanceLabel(avgScore)}
          </h2>
        </motion.div>
        <motion.div variants={fadeUp} className="shrink-0">
          <ScoreRing score={avgScore} size={140} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-l border-[#262626] mb-8 sm:mb-16">
        <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 sm:mb-4">ITEMS</span>
          <div className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">{confidentAnswers}</div>
        </motion.div>
        <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 sm:mb-4">AVG SCORE</span>
          <div className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FF3D00]">
            <AnimatedNumber value={avgScore} />
          </div>
        </motion.div>
        <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 sm:mb-4">WEAK LINKS</span>
          <div className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">{weakConcepts.length}</div>
        </motion.div>
      </div>

      {weakConcepts.length > 0 && (
        <motion.div variants={fadeUp} className="mb-8 sm:mb-16">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            <h3 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">SYSTEM WEAKNESSES</h3>
            <div className="h-[1px] flex-1 bg-[#262626]" />
            <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
              {weakConcepts.length.toString().padStart(2, "0")} TOPICS
            </span>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            {weakConcepts.map((concept, idx) => (
              <span key={idx} className="border border-[#262626] text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase px-3 sm:px-4 py-2">
                {concept}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        variants={fadeUp}
        className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-6 pt-8 sm:pt-12 border-t border-[#262626]"
      >
        <PrimaryButton
          onClick={handleCreateTutorSession}
          disabled={weakConcepts.length === 0 || isSaving}
          className="justify-center sm:justify-start"
        >
          {isSaving ? "PROCESSING..." : (
            <>
              <span className="hidden sm:inline">STUDY WITH AI TUTOR</span>
              <span className="sm:hidden">AI TUTOR</span>
            </>
          )}
          <ArrowRight className="w-4 h-4 ml-1" />
        </PrimaryButton>
        <SecondaryButton onClick={resetSession} className="justify-center">
          <RotateCw className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">NEW ATTEMPT</span>
          <span className="sm:hidden">RETRY</span>
        </SecondaryButton>
        <GhostButton onClick={() => navigate("/workspace")} className="justify-center sm:justify-start">
          <span className="hidden sm:inline">WORKSPACE DASHBOARD</span>
          <span className="sm:hidden">WORKSPACE</span>
        </GhostButton>
      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────

export default function VoiceRecall() {
  const { step } = useVoiceRecallStore();
  const remaining = useRateLimitStore((s) => s.remaining);
  const limit = useRateLimitStore((s) => s.limit);
  const resetTime = useRateLimitStore((s) => s.resetTime);

  // ↓ scroll to top whenever session begins
  useEffect(() => {
    if (step === "session") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  return (
    <PageWrapper>
      <RateLimitBanner remaining={remaining} limit={limit} resetTime={resetTime} showAddKeyPrompt={true} />

      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-8 sm:pb-16 md:pb-32 font-sans">
        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        {/* ── HERO — hidden during active session ── */}
        {step !== "session" && (
          <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-12"
            >
              <div>
                <motion.h1
                  variants={fadeUp}
                  className="text-4xl sm:text-6xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none uppercase"
                >
                  VOICE RECALL.
                </motion.h1>
                <motion.div variants={fadeUp} className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6">
                  <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                  <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                    <span className="hidden sm:inline">AUDIO ANALYSIS {"//"} {step.toUpperCase()}</span>
                    <span className="sm:hidden">{step.toUpperCase()}</span>
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <div className={cn(
          "max-w-7xl mx-auto px-4 sm:px-8 md:px-16",
          // ↓ tighter top padding during session since there's no hero
          step === "session" ? "py-6 sm:py-8" : "py-8 sm:py-12 md:py-16"
        )}>
          <AnimatePresence mode="wait">
            {step === "setup"    && <SetupScreen    key="setup"    />}
            {step === "session"  && <SessionScreen  key="session"  />}
            {step === "feedback" && <FeedbackScreen key="feedback" />}
            {step === "complete" && <CompleteScreen key="complete" />}
          </AnimatePresence>
        </div>
      </div>
    </PageWrapper>
  );
}