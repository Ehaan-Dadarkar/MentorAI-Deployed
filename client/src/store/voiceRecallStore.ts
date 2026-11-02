import { create } from "zustand";
import api from "@/lib/axios";
import { openApiKeyGate } from "@/lib/apiKeyGate";

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

export type EvaluationVerdict =
  | "excellent"
  | "good"
  | "partial"
  | "incorrect"
  | "skipped"
  | "unevaluated";

export interface EvaluationResponse {
  score: number | null;
  verdict: EvaluationVerdict;
  whatWasCorrect: string;
  whatWasMissed: string[];
  improvement: string;
  encouragement: string;
  speechCorrections?: SpeechCorrection[];
}

export interface Response {
  question: string;
  spokenAnswer: string;
  score: number | null;
  verdict: string;
  evaluation: EvaluationResponse;
}

// M5: how much of the note the server used to generate questions.
export interface QuestionSource {
  usedChars: number;
  totalChars: number;
  truncated: boolean;
}

// H9: weak concepts are derived from the session's own responses, never
// stored blind. A response counts as weak when its score is below
// threshold; its whatWasMissed entries are aggregated, deduped
// (case-insensitive), and the top N win. Unevaluated responses (M14)
// never contribute.
const WEAK_SCORE_THRESHOLD = 60;
const MAX_WEAK_CONCEPTS = 5;

export function deriveWeakConcepts(responses: Response[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const r of responses) {
    if (r.evaluation?.verdict === "unevaluated") continue;
    if (typeof r.score !== "number" || r.score >= WEAK_SCORE_THRESHOLD) continue;
    for (const missed of r.evaluation?.whatWasMissed ?? []) {
      const label = missed.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_WEAK_CONCEPTS)
    .map((e) => e.label);
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
  // H8: server-persisted question set id. Grading uses the stored key
  // points; the client never sends key points for evaluation.
  questionSetId: string | null;
  questionSource: QuestionSource | null;

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
  reevaluateResponse: (index: number) => Promise<void>;
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
  questionSetId: null,
  questionSource: null,

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
        questionSetId: data.questionSetId ?? null,
        questionSource: data.questionSource ?? null,
        responses: [],
        currentQuestionIndex: 0,
        confidence: 3,
        step: "session",
        isGenerating: false,
      });
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isGenerating: false });
        return;
      }
      console.error("Failed to generate questions:", error);
      set({ isGenerating: false });
    }
  },

  setConfidence: (confidence) => set({ confidence }),

  submitAnswer: async (spokenAnswer) => {
    const { questions, currentQuestionIndex, confidence, questionSetId } = get();
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;
    if (!questionSetId) {
      // H8: without the server-persisted set there is nothing honest to
      // grade against — refuse instead of grading client-held key points.
      console.error(
        "Cannot evaluate answer: no server question set. Generate questions first.",
      );
      return;
    }

    set({ isEvaluating: true });
    try {
      const { data } = await api.post("/voice-recall/evaluate", {
        questionSetId,
        questionIndex: currentQuestionIndex,
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
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isEvaluating: false });
        return;
      }
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

  // M14: re-run evaluation for a response the provider failed to score.
  // Only unevaluated responses are eligible; a successful re-evaluation
  // replaces the entry in place (score may still be null if it fails
  // again — it stays unevaluated, never a fake 0).
  reevaluateResponse: async (index) => {
    const { responses, questionSetId } = get();
    const target = responses[index];
    if (!target || !questionSetId) return;
    if (target.evaluation?.verdict !== "unevaluated") return;

    set({ isEvaluating: true });
    try {
      const { data } = await api.post("/voice-recall/evaluate", {
        questionSetId,
        questionIndex: index,
        spokenAnswer: target.spokenAnswer,
        confidence: 3,
      });

      set((state) => ({
        responses: state.responses.map((r, i) =>
          i === index
            ? {
                ...r,
                score: data.evaluation.score,
                verdict: data.evaluation.verdict,
                evaluation: data.evaluation,
              }
            : r,
        ),
        isEvaluating: false,
      }));
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isEvaluating: false });
        return;
      }
      console.error("Failed to re-evaluate answer:", error);
      set({ isEvaluating: false });
    }
  },

  endSession: async () => {
    const { selectedNoteId, questions, responses, questionSetId } = get();

    // M14: unevaluated responses carry no score and are excluded from
    // the average instead of dragging it to zero.
    const evaluated = responses.filter(
      (r) => r.evaluation?.verdict !== "unevaluated" && typeof r.score === "number",
    );
    const avgScore =
      evaluated.length > 0
        ? Math.round(
            evaluated.reduce((sum, r) => sum + (r.score as number), 0) /
              evaluated.length,
          )
        : 0;

    // H9: derive weak concepts from low-scoring responses — the state
    // field was previously always empty.
    const weakConcepts = deriveWeakConcepts(responses);

    set({ avgScore, weakConcepts, isSaving: true });

    try {
      const { data } = await api.post("/voice-recall/save-session", {
        noteId: selectedNoteId,
        questionSetId: questionSetId ?? undefined,
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
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isSaving: false });
        return;
      }
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
      questionSetId: null,
      questionSource: null,
      avgScore: 0,
      weakConcepts: [],
      sessionId: null,
    });
  },
}));
