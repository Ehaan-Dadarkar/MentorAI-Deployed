import { create } from "zustand";
import api from "@/lib/axios";

export interface Question {
  question: string;
  keyPoints: string[];
  difficulty: "easy" | "medium" | "hard";
}

export interface SpeechCorrection {
  heard: string;
  intended: string;
  context: string;
}

export interface EvaluationResponse {
  score: number;
  verdict: "excellent" | "good" | "partial" | "incorrect";
  whatWasCorrect: string;
  whatWasMissed: string[];
  improvement: string;
  encouragement: string;
  speechCorrections?: SpeechCorrection[];
}

export interface Response {
  question: string;
  spokenAnswer: string;
  score: number;
  verdict: string;
  evaluation: EvaluationResponse;
}

interface VoiceRecallState {
  // Step 1: Setup
  selectedNoteId: string | null;
  topic: string;
  questionCount: number;
  notes: Array<{ _id: string; title: string; subject: string; tags: string[] }>;

  // Step 2: Session
  step: "setup" | "session" | "feedback" | "complete";
  questions: Question[];
  responses: Response[];
  currentQuestionIndex: number;
  confidence: number;

  // Step 3: Results
  avgScore: number;
  weakConcepts: string[];
  sessionId: string | null;

  // Loading states
  isLoadingNotes: boolean;
  isGenerating: boolean;
  isEvaluating: boolean;
  isSaving: boolean;

  // Actions
  fetchNotes: () => Promise<void>;
  setSelectedNote: (noteId: string) => void;
  setTopic: (topic: string) => void;
  setQuestionCount: (count: number) => void;
  startSession: () => Promise<void>;
  setConfidence: (confidence: number) => void;
  submitAnswer: (spokenAnswer: string) => Promise<void>;
  skipQuestion: () => void;
  nextQuestion: () => void;
  endSession: () => Promise<void>;
  resetSession: () => void;
}

export const useVoiceRecallStore = create<VoiceRecallState>((set, get) => ({
  // Step 1: Setup
  selectedNoteId: null,
  topic: "",
  questionCount: 5,
  notes: [],

  // Step 2: Session
  step: "setup",
  questions: [],
  responses: [],
  currentQuestionIndex: 0,
  confidence: 3,

  // Step 3: Results
  avgScore: 0,
  weakConcepts: [],
  sessionId: null,

  // Loading states
  isLoadingNotes: false,
  isGenerating: false,
  isEvaluating: false,
  isSaving: false,

  fetchNotes: async () => {
    set({ isLoadingNotes: true });
    try {
      const { data } = await api.get("/notes?deleted=false");
      set({ notes: data.notes || [] });
    } catch (error) {
      console.error("Failed to fetch notes:", error);
      set({ notes: [] });
    } finally {
      set({ isLoadingNotes: false });
    }
  },

  setSelectedNote: (noteId) => set({ selectedNoteId: noteId }),
  setTopic: (topic) => set({ topic }),
  setQuestionCount: (count) => set({ questionCount: count }),

  startSession: async () => {
    const { selectedNoteId, questionCount } = get();
    if (!selectedNoteId) return;

    set({ isGenerating: true });
    try {
      const { data } = await api.post("/voice-recall/generate-questions", {
        noteId: selectedNoteId,
        count: questionCount,
      });

      set({
        questions: data.questions,
        responses: [],
        currentQuestionIndex: 0,
        confidence: 3,
        step: "session",
        isGenerating: false,
      });
    } catch (error) {
      console.error("Failed to generate questions:", error);
      set({ isGenerating: false });
    }
  },

  setConfidence: (confidence) => set({ confidence }),

  submitAnswer: async (spokenAnswer) => {
    const { questions, currentQuestionIndex, confidence } = get();
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    set({ isEvaluating: true });
    try {
      const { data } = await api.post("/voice-recall/evaluate", {
        question: currentQuestion.question,
        correctKeyPoints: currentQuestion.keyPoints,
        spokenAnswer,
        confidence,
      });

      set((state) => ({
        responses: [
          ...state.responses,
          {
            question: currentQuestion.question,
            spokenAnswer,
            score: data.evaluation.score,
            verdict: data.evaluation.verdict,
            evaluation: data.evaluation,
          },
        ],
        step: "feedback",
        isEvaluating: false,
      }));
    } catch (error) {
      console.error("Failed to evaluate answer:", error);
      set({ isEvaluating: false });
    }
  },

  skipQuestion: () => {
    const { questions, currentQuestionIndex } = get();
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    set((state) => ({
      responses: [
        ...state.responses,
        {
          question: currentQuestion.question,
          spokenAnswer: "",
          score: 0,
          verdict: "Skipped",
          evaluation: {
            score: 0,
            verdict: "incorrect" as const,
            whatWasCorrect: "",
            whatWasMissed: currentQuestion.keyPoints,
            improvement: "Review this concept and try again next session",
            encouragement: "",
          },
        },
      ],
      step: "feedback" as const,
    }));
  },

  nextQuestion: () => {
    const { currentQuestionIndex, questions } = get();
    if (currentQuestionIndex + 1 < questions.length) {
      set({
        currentQuestionIndex: currentQuestionIndex + 1,
        confidence: 3,
        step: "session",
      });
    } else {
      set({ step: "complete" });
    }
  },

  endSession: async () => {
    const { selectedNoteId, questions, responses, weakConcepts } = get();

    const avgScore =
      responses.length > 0
        ? Math.round(
            responses.reduce((sum, r) => sum + r.score, 0) / responses.length,
          )
        : 0;

    set({ avgScore, isSaving: true });

    try {
      const { data } = await api.post("/voice-recall/save-session", {
        noteId: selectedNoteId,
        questions: questions.map((q) => q.question),
        responses: responses.map((r) => ({
          question: r.question,
          spokenAnswer: r.spokenAnswer,
          score: r.score,
          verdict: r.verdict,
        })),
        avgScore,
        weakConcepts,
      });

      set({
        sessionId: data.sessionId,
        isSaving: false,
      });
    } catch (error) {
      console.error("Failed to save session:", error);
      set({ isSaving: false });
    }
  },

  resetSession: () => {
    set({
      selectedNoteId: null,
      topic: "",
      questionCount: 5,
      step: "setup",
      questions: [],
      responses: [],
      currentQuestionIndex: 0,
      confidence: 3,
      avgScore: 0,
      weakConcepts: [],
      sessionId: null,
    });
  },
}));
