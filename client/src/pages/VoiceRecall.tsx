import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, RotateCw, Play, ArrowRight, Search, Pencil } from "lucide-react";
import axios from "@/lib/axios";
import { cn } from "@/lib/utils";
import { useVoiceRecallStore } from "@/store/voiceRecallStore";
import { useRateLimitStore } from "@/store/rateLimitStore";

// ── Animation Config (copy from components.md) ─────────────────────
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

// ── Buttons ────────────────────────────────────────
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

// Sound wave visualization
function SoundWave() {
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-[#FF3D00] rounded-none"
          animate={{ height: [8, 24, 8] }}
          transition={{
            duration: 0.6,
            delay: i * 0.1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

// Animated number counter
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(interval);
      } else {
        setDisplay(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value]);

  return <span>{display.toString().padStart(2, "0")}</span>;
}

// Circular score ring SVG (Brutalist style)
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 60 ? "#FF3D00" : "#737373";

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        className="-rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#262626"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="square"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.8, ease: easing }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tighter" style={{ color: score >= 60 ? "#FAFAFA" : "#737373" }}>
          {score.toString().padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// Performance label for complete screen
function getPerformanceLabel(score: number): string {
  if (score >= 90) return "OUTSTANDING";
  if (score >= 75) return "WELL DONE";
  if (score >= 60) return "GOOD EFFORT";
  return "KEEP PRACTICING";
}

// ──────────────────────────────────────────────────────────
// COUNTDOWN TIMER (circular SVG ring)
// ──────────────────────────────────────────────────────────

const QUESTION_TIME_LIMIT = 60; // seconds

function CountdownTimer({
  secondsLeft,
  total,
}: {
  secondsLeft: number;
  total: number;
}) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / total;
  const dashOffset = circumference * (1 - progress);

  let color = "#FAFAFA";
  if (secondsLeft <= 10) color = "#FF3D00";
  else if (secondsLeft <= 20) color = "#FAFAFA";

  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="-rotate-90" width={56} height={56} viewBox="0 0 56 56">
        <circle
          cx={28}
          cy={28}
          r={radius}
          fill="none"
          stroke="#262626"
          strokeWidth={2}
        />
        <circle
          cx={28}
          cy={28}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="square"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s border-color 0.3s" }}
        />
      </svg>
      <span className="absolute text-xs font-bold tracking-tighter" style={{ color }}>
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
    selectedNoteId,
    questionCount,
    notes,
    isLoadingNotes,
    isGenerating,
    fetchNotes,
    setSelectedNote,
    setQuestionCount,
    startSession,
  } = useVoiceRecallStore();

  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleStart = async () => {
    if (selectedNoteId) {
      await startSession();
    }
  };

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
        {/* Left config column */}
        <motion.div variants={fadeUp} className="col-span-1 lg:col-span-8 space-y-12">
          {/* Note selector */}
          <section>
            <div className="flex items-center gap-4 mb-8">
              <h2 className="text-3xl font-bold tracking-tighter uppercase">
                1. SELECT SOURCE
              </h2>
              <div className="h-[1px] flex-1 bg-[#262626]" />
              <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                {notes.length.toString().padStart(2, "0")} NOTES
              </span>
            </div>

            <div className="mb-6">
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

            {/* Note Grid */}
            {isLoadingNotes ? (
              <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l border-[#262626]">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-32 border-b border-r border-[#262626] bg-[#0A0A0A] animate-pulse"
                  />
                ))}
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="border border-[#262626] p-16 flex flex-col items-center text-center">
                <h3 className="text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
                  VOID.
                </h3>
                <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
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
                      "group relative border-b border-r border-[#262626] p-6 cursor-pointer overflow-hidden flex flex-col min-h-[160px]",
                      selectedNoteId === note._id ? "bg-[#1A1A1A]" : "bg-transparent"
                    )}
                    onClick={() => setSelectedNote(note._id)}
                  >
                    {!selectedNoteId || selectedNoteId !== note._id ? (
                      <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                    ) : null}
                    
                    <div className={cn(
                      "relative z-10 flex-1 flex flex-col transition-colors duration-500",
                      selectedNoteId === note._id ? "text-[#FAFAFA]" : "group-hover:text-[#0A0A0A] text-[#737373]"
                    )}>
                      <h4 className={cn("text-lg font-bold tracking-tight mb-2 uppercase line-clamp-2", selectedNoteId === note._id ? "text-[#FF3D00]" : "text-[#FAFAFA] group-hover:text-[#0A0A0A]")}>
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

        {/* Right config column */}
        <motion.div variants={fadeUp} className="col-span-1 lg:col-span-4 space-y-12">
          {/* Question count */}
          <section>
            <div className="flex items-center gap-4 mb-8">
              <h2 className="text-3xl font-bold tracking-tighter uppercase">
                2. SETUP
              </h2>
              <div className="h-[1px] flex-1 bg-[#262626]" />
            </div>

            <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
              QUESTIONS COUNT
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-l border-[#262626] mb-12">
              {[3, 5, 8, 10].map((count) => (
                <button
                  key={count}
                  onClick={() => setQuestionCount(count)}
                  className={cn(
                    "border-b border-r border-[#262626] p-4 text-center text-lg font-bold tracking-tighter transition-colors",
                    questionCount === count
                      ? "bg-[#FAFAFA] text-[#0A0A0A]"
                      : "bg-[#0A0A0A] text-[#737373] hover:text-[#FAFAFA]"
                  )}
                >
                  {count}
                </button>
              ))}
            </div>

            {/* Mic rule */}
            <div className="border border-[#262626] p-6 mb-8">
              <Mic className="w-5 h-5 text-[#FF3D00] mb-4" />
              <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase leading-relaxed">
                MICROPHONE STREAM REQUIRED.<br/>
                SPEAK CLEARLY.<br/>
                NO HESITATION.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <SecondaryButton
                onClick={handleStart}
                disabled={!selectedNoteId || isGenerating}
                className="w-full justify-between"
              >
                {isGenerating ? (
                  <span className="flex items-center">
                    <RotateCw className="w-4 h-4 mr-2 animate-spin" />
                    GENERATING...
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
    confidence,
    isEvaluating,
    setConfidence,
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

  // ── Timer state ──
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_TIME_LIMIT);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoSubmitted = useRef(false);

  // Sync edited transcript when transcript updates
  useEffect(() => {
    setEditedTranscript(transcript);
    setIsEditing(false);
  }, [transcript]);

  // Reset on question change
  useEffect(() => {
    setTranscript("");
    setEditedTranscript("");
    setIsEditing(false);
    setIsRecording(false);
    setIsTranscribing(false);
  }, [currentQuestionIndex]);

  // Reset timer whenever question index changes
  useEffect(() => {
    setSecondsLeft(QUESTION_TIME_LIMIT);
    hasAutoSubmitted.current = false;
  }, [currentQuestionIndex]);

  // Tick every second while session is active
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQuestionIndex]);

  // Auto-submit / auto-skip when timer hits 0
  useEffect(() => {
    if (secondsLeft === 0 && !hasAutoSubmitted.current && !isEvaluating) {
      hasAutoSubmitted.current = true;
      if (timerRef.current) clearInterval(timerRef.current);

      if (editedTranscript.trim()) {
        submitAnswer(editedTranscript);
      } else {
        skipQuestion();
      }
    }
  }, [secondsLeft, isEvaluating, editedTranscript, submitAnswer, skipQuestion]);

  const currentQuestion = questions[currentQuestionIndex];
  const hasTranscript =
    editedTranscript.trim().length > 0 || transcript.trim().length > 0;

  if (!currentQuestion) return null;

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setTranscript("");
      setEditedTranscript("");
    } catch (err) {
      console.error("Mic error:", err);
    }
  };

  const stopRecording = async () => {
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    ) {
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);

    streamRef.current?.getTracks().forEach((t) => t.stop());

    mediaRecorderRef.current.stop();

    await new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = () => resolve();
    });

    try {
      const blob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });

      if (blob.size < 1000) {
        setIsTranscribing(false);
        return;
      }

      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const store = useVoiceRecallStore.getState();
      const note = store.notes.find((n) => n._id === store.selectedNoteId);
      if (note?.subject) {
        formData.append("subject", note.subject);
      }

      const response = await axios.post("/voice/transcribe", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data.transcript) {
        setTranscript(response.data.transcript);
      }
    } catch (err) {
      console.error("Transcription error:", err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const stopRecordingIfActive = () => {
    if (isRecording) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopRecordingIfActive();
    const answer = editedTranscript.trim() || transcript.trim();
    if (answer) {
      await submitAnswer(answer);
      setTranscript("");
      setEditedTranscript("");
    }
  };

  const handleSkip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopRecordingIfActive();
    setTranscript("");
    setEditedTranscript("");
    skipQuestion();
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    return (
      <div className="flex justify-center items-center h-64 border border-[#FF3D00] p-8 text-center text-[#FF3D00] font-bold tracking-[0.2em] uppercase max-w-2xl mx-auto">
        MICROPHONE NOT SUPPORTED BY HARDWARE/BROWSER.
      </div>
    );
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-16 pb-20">
      
      {/* TOP HEADER / TIMER */}
      <motion.div variants={fadeUp} className="flex items-center justify-between border-b border-[#262626] pb-8">
        <div>
          <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase block mb-3">
            PROGRESS {currentQuestionIndex + 1} OF {questions.length}
          </span>
          <div className="flex items-center gap-2">
            {questions.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "w-8 h-1 rounded-none transition-colors",
                  idx === currentQuestionIndex
                    ? "bg-[#FF3D00]"
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

      {/* QUESTION */}
      <motion.div variants={fadeUp} className="border border-[#262626] p-8 md:p-12 relative bg-[#0A0A0A]">
        <div className="absolute top-0 left-0 w-16 h-1 bg-[#FF3D00]" />
        
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-none mb-12">
          {currentQuestion.question}
        </h2>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-t border-[#262626] pt-8">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#737373] flex items-center">
            DIFFICULTY: <span className="text-[#FAFAFA] ml-2">{currentQuestion.difficulty}</span>
          </span>
          <div className="flex flex-wrap gap-2 justify-start md:justify-end">
            {currentQuestion.keyPoints.map((point, idx) => (
              <span
                key={idx}
                className="bg-transparent text-[#737373] text-[10px] uppercase font-bold tracking-widest px-3 py-1 border border-[#262626]"
              >
                {point}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* CONFIDENCE & RECORDING GRID */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 gap-16 border-t border-[#262626] pt-16">
        
        {/* LEFT CONFIG */}
        <motion.div variants={fadeUp} className="flex flex-col justify-between">
          <div className="mb-12">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
              CONFIDENCE PROTOCOL
            </span>
            <div className="flex gap-0 border border-[#262626] bg-[#0A0A0A] w-fit">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setConfidence(rating)}
                  disabled={isRecording || isEvaluating}
                  className={cn(
                    "w-12 h-12 flex items-center justify-center font-bold font-mono transition-colors border-r border-[#262626] last:border-r-0",
                    confidence >= rating
                      ? "bg-[#FAFAFA] text-[#0A0A0A]"
                      : "bg-transparent text-[#737373] hover:text-[#FAFAFA]"
                  )}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <SecondaryButton
              onClick={handleSubmit}
              disabled={isEvaluating || !hasTranscript}
            >
              {isEvaluating ? (
                <span className="flex items-center">
                  <RotateCw className="w-4 h-4 mr-2 animate-spin" />
                  EVALUATING...
                </span>
              ) : (
                "SUBMIT ANSWER"
              )}
            </SecondaryButton>
            <GhostButton onClick={handleSkip} disabled={isEvaluating}>
              I DON&apos;T KNOW
            </GhostButton>
          </div>
        </motion.div>
        
        {/* RIGHT MIC AREA */}
        <motion.div variants={fadeUp} className="flex flex-col items-start md:items-end">
          <div className="w-full border border-[#262626] p-8 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden bg-[#0A0A0A]">
            <button
              onClick={toggleRecording}
              disabled={isEvaluating || isTranscribing}
              className={cn(
                "relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300",
                isRecording
                  ? "bg-[#FF3D00] text-[#0A0A0A] scale-110"
                  : "bg-transparent border border-[#FAFAFA] text-[#FAFAFA] hover:bg-[#FAFAFA] hover:text-[#0A0A0A]"
              )}
            >
              <Mic className="w-8 h-8" />
            </button>

            <div className="mt-8 h-12 flex items-center justify-center w-full">
              {isRecording ? (
                <SoundWave />
              ) : isTranscribing ? (
                <span className="text-xs font-bold tracking-[0.2em] text-[#FAFAFA] flex items-center uppercase animate-pulse">
                  <RotateCw className="w-4 h-4 mr-2 animate-spin text-[#FF3D00]" />
                  PROCESSING SIGNAL...
                </span>
              ) : (
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase transition-opacity">
                  AWAITING SOUND SIGNAL / TAP MIC
                </span>
              )}
            </div>
          </div>

          <AnimatePresence>
            {(transcript || editedTranscript) && (
              <motion.div
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                className="w-full mt-6 border border-[#262626] origin-top bg-[#0A0A0A]"
              >
                <div className="flex items-center justify-between p-4 border-b border-[#262626]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#737373]">
                    TRANSCRIPT DATA
                  </span>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-[#FF3D00] uppercase hover:text-[#FAFAFA] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    {isEditing ? "LOCK" : "EDIT"}
                  </button>
                </div>
                <div className="p-4">
                  {isEditing ? (
                    <textarea
                      value={editedTranscript}
                      onChange={(e) => setEditedTranscript(e.target.value)}
                      className="w-full bg-transparent text-sm font-mono text-[#FAFAFA] resize-y min-h-[100px] outline-none"
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

      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────
// STEP 3: FEEDBACK SCREEN
// ──────────────────────────────────────────────────────────

function FeedbackScreen() {
  const { responses, nextQuestion, isEvaluating } = useVoiceRecallStore();
  const lastResponse = responses[responses.length - 1];

  if (!lastResponse) return null;

  const { score, whatWasCorrect, whatWasMissed, improvement } =
    lastResponse.evaluation;
  const displayVerdict = lastResponse.verdict || "UNKNOWN";

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-16 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-8 border-b border-[#262626] pb-12">
        <motion.div variants={fadeUp}>
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
            EVALUATION REPORT
          </span>
          <h2 className="text-6xl md:text-8xl font-bold tracking-tighter uppercase text-[#FAFAFA] leading-none">
            {displayVerdict}
          </h2>
        </motion.div>
        <motion.div variants={fadeUp} className="shrink-0 flex items-center justify-center">
          <ScoreRing score={score} size={140} />
        </motion.div>
      </div>

      {/* FEEDBACK GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l border-[#262626]">
        {/* GOT RIGHT */}
        {whatWasCorrect && (
          <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#262626] px-3 py-1 mb-6 inline-block">
              POSITIVES
            </span>
            <p className="text-sm font-medium text-[#FAFAFA] leading-relaxed uppercase tracking-wide">
              {whatWasCorrect}
            </p>
          </motion.div>
        )}
        
        {/* MISSED */}
        {whatWasMissed && whatWasMissed.length > 0 && (
          <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#FF3D00] px-3 py-1 mb-6 inline-block">
              OMISSIONS
            </span>
            <div className="space-y-4">
              {whatWasMissed.map((item, idx) => (
                <div key={idx} className="flex gap-4">
                  <span className="text-[#FF3D00] font-bold">×</span>
                  <span className="text-sm text-[#737373] uppercase tracking-wide leading-relaxed">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* SPEECH CORRECTIONS */}
        {lastResponse.evaluation.speechCorrections && lastResponse.evaluation.speechCorrections.length > 0 && (
          <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12 col-span-1 md:col-span-2 bg-[#0A0A0A]">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#262626] px-3 py-1 mb-6 inline-block">
              SPEECH MISMATCHES
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {lastResponse.evaluation.speechCorrections.map((correction, idx) => (
                <div key={idx} className="border border-[#262626] p-4 text-xs font-mono uppercase tracking-widest flex items-center justify-between">
                  <span className="text-[#737373] line-through">{correction.heard}</span>
                  <ArrowRight className="w-3 h-3 text-[#FAFAFA] mx-2" />
                  <span className="text-[#FF3D00] font-bold">{correction.intended}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* NEXT TIME */}
        {improvement && (
          <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12 col-span-1 md:col-span-2">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#FAFAFA] uppercase bg-[#262626] px-3 py-1 mb-6 inline-block">
              IMPROVEMENT VECTOR
            </span>
            <p className="text-lg font-bold tracking-tight text-[#FF3D00] uppercase leading-relaxed max-w-2xl">
              {improvement}
            </p>
          </motion.div>
        )}
      </div>

      <motion.div variants={fadeUp} className="flex justify-end pt-8">
         <PrimaryButton onClick={nextQuestion} disabled={isEvaluating}>
          {isEvaluating ? "PROCESSING..." : "NEXT ITEM"} <ArrowRight className="w-4 h-4 ml-1" />
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
  const {
    responses,
    weakConcepts,
    avgScore,
    endSession,
    resetSession,
    isSaving,
  } = useVoiceRecallStore();

  const confidentAnswers = responses.filter((r) => r.evaluation).length;

  const handleCreateTutorSession = () => {
    const topicList = weakConcepts.slice(0, 5).join(",");
    navigate(`/tutor?topics=${encodeURIComponent(topicList)}`);
  };

  const handleTryAgain = () => {
    resetSession();
  };

  useEffect(() => {
    endSession();
  }, [endSession]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl mx-auto pb-20">
      
      {/* FINAL HEADER */}
      <div className="flex flex-col md:flex-row items-center justify-between border-b border-[#262626] pb-16 mb-16 gap-8">
        <motion.div variants={fadeUp}>
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4 block">
            SESSION TERMINATED
          </span>
          <h2 className="text-6xl md:text-8xl lg:text-[7rem] font-bold tracking-tighter uppercase text-[#FAFAFA] leading-none mb-4">
            {getPerformanceLabel(avgScore)}
          </h2>
        </motion.div>
        <motion.div variants={fadeUp} className="shrink-0">
          <ScoreRing score={avgScore} size={180} />
        </motion.div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-t border-l border-[#262626] mb-16">
        <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4">ITEMS</span>
          <div className="text-6xl font-bold tracking-tighter text-[#FAFAFA]">{confidentAnswers}</div>
        </motion.div>
        <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4">AVG SCORE</span>
          <div className="text-6xl font-bold tracking-tighter text-[#FF3D00]"><AnimatedNumber value={avgScore} /></div>
        </motion.div>
        <motion.div variants={fadeUp} className="border-b border-r border-[#262626] p-8 md:p-12 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-4">WEAK LINKS</span>
          <div className="text-6xl font-bold tracking-tighter text-[#FAFAFA]">{weakConcepts.length}</div>
        </motion.div>
      </div>

      {/* WEAK CONCEPTS */}
      {weakConcepts.length > 0 && (
        <motion.div variants={fadeUp} className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <h3 className="text-3xl font-bold tracking-tighter uppercase">
               SYSTEM WEAKNESSES
            </h3>
            <div className="h-[1px] flex-1 bg-[#262626]" />
            <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
              {weakConcepts.length.toString().padStart(2, "0")} TOPICS
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            {weakConcepts.map((concept, idx) => (
              <span
                key={idx}
                className="border border-[#262626] text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase px-4 py-2"
              >
                {concept}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* ACTIONS */}
      <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center gap-6 pt-12 border-t border-[#262626]">
        <PrimaryButton
          onClick={handleCreateTutorSession}
          disabled={weakConcepts.length === 0 || isSaving}
        >
          {isSaving ? "PROCESSING..." : "STUDY WITH AI TUTOR"} <ArrowRight className="w-4 h-4 ml-1" />
        </PrimaryButton>
        <SecondaryButton onClick={handleTryAgain}>
          <RotateCw className="w-4 h-4 mr-2" /> NEW ATTEMPT
        </SecondaryButton>
        <GhostButton onClick={() => navigate("/workspace")}>
          WORKSPACE DASHBOARD
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

  return (
    <PageWrapper>
      <RateLimitBanner
        remaining={remaining}
        limit={limit}
        resetTime={resetTime}
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
                className="text-7xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none uppercase"
              >
                VOICE RECALL.
              </motion.h1>
              <motion.div 
                variants={fadeUp}
                className="mt-6 flex items-center gap-6"
              >
                <div className="h-1 w-12 bg-[#FF3D00]" />
                <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  AUDIO ANALYSIS {"//"} {step.toUpperCase()}
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* MAIN CONTENT */}
        <div className="max-w-7xl mx-auto px-8 md:px-16 py-16">
          <AnimatePresence mode="wait">
            {step === "setup" && <SetupScreen key="setup" />}
            {step === "session" && <SessionScreen key="session" />}
            {step === "feedback" && <FeedbackScreen key="feedback" />}
            {step === "complete" && <CompleteScreen key="complete" />}
          </AnimatePresence>
        </div>
      </div>
    </PageWrapper>
  );
}