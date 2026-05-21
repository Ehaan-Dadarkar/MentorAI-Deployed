import { create } from "zustand";
import api from "@/lib/axios";
import { openApiKeyGate } from "@/lib/apiKeyGate";
import type { Quiz, ChatMessage } from "@/types";

export type QuizDifficulty = "easy" | "medium" | "hard";

interface QuizSubmitQuestionResult {
  question: string;
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  concept: string;
  options: string[];
}

interface QuizResults {
  score: number;
  correctCount: number;
  weakTopics: string[];
  questionResults: QuizSubmitQuestionResult[];
  timeTaken: number;
}

interface QuizGenerateParams {
  subject: string;
  topic?: string;
  count: 5 | 10 | 20;
  difficulty: QuizDifficulty;
  content?: string;
  deckName?: string;
  createFlashcardDeck?: boolean;
}

interface QuizState {
  history: Quiz[];
  currentQuiz: Quiz | null;
  answers: number[];
  results: QuizResults | null;
  isLoading: boolean;
  isGenerating: boolean;
  isSubmitting: boolean;
  fetchHistory: () => Promise<void>;
  fetchQuiz: (id: string) => Promise<void>;
  generateQuiz: (params: QuizGenerateParams) => Promise<Quiz>;
  deleteQuizDeck: (id: string) => Promise<void>;
  setAnswer: (questionIndex: number, optionIndex: number) => void;
  resetSession: () => void;
  submitQuiz: (timeTaken: number) => Promise<QuizResults>;
}

export const useQuizStore = create<QuizState>((set, get) => ({
  history: [],
  currentQuiz: null,
  answers: [],
  results: null,
  isLoading: false,
  isGenerating: false,
  isSubmitting: false,

  fetchHistory: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get("/quiz/history");
      set({ history: data.quizzes || [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchQuiz: async (id) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`/quiz/${id}`);
      const quiz = data.quiz as Quiz;
      set({
        currentQuiz: quiz,
        answers: new Array(quiz.questions.length).fill(-1),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  generateQuiz: async ({
    subject,
    topic,
    count,
    difficulty,
    content,
    deckName,
    createFlashcardDeck,
  }) => {
    set({ isGenerating: true, results: null, answers: [] });
    try {
      const { data } = await api.post("/quiz/generate", {
        subject,
        topic,
        count,
        difficulty,
        content,
        deckName,
        createFlashcardDeck,
      });

      const quiz = data.quiz as Quiz;
      set((state) => ({
        currentQuiz: quiz,
        answers: new Array(quiz.questions.length).fill(-1),
        isGenerating: false,
        history: [quiz, ...state.history],
      }));

      return quiz;
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isGenerating: false });
        return Promise.reject(error);
      }
      set({ isGenerating: false });
      throw error;
    }
  },

  deleteQuizDeck: async (id) => {
    await api.delete(`/quiz/${id}`);

    set((state) => ({
      history: state.history.filter((quiz) => quiz._id !== id),
      currentQuiz: state.currentQuiz?._id === id ? null : state.currentQuiz,
      results: state.currentQuiz?._id === id ? null : state.results,
      answers: state.currentQuiz?._id === id ? [] : state.answers,
    }));
  },

  setAnswer: (questionIndex, optionIndex) => {
    set((state) => {
      const next = [...state.answers];
      if (questionIndex < 0 || questionIndex >= next.length) return state;
      next[questionIndex] = optionIndex;
      return { answers: next };
    });
  },

  resetSession: () => {
    set({
      currentQuiz: null,
      answers: [],
      results: null,
      isSubmitting: false,
      isGenerating: false,
    });
  },

  submitQuiz: async (timeTaken) => {
    const { currentQuiz, answers } = get();
    if (!currentQuiz) {
      throw new Error("No active quiz to submit");
    }

    const questions = currentQuiz.questions.map((q) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctAnswer,
      explanation: q.explanation,
      concept: q.topic,
    }));

    set({ isSubmitting: true });
    try {
      const payload = {
        quizId: currentQuiz._id,
        deckName: currentQuiz.deckName,
        ...(currentQuiz.deckId ? { deckId: currentQuiz.deckId } : {}),
        questions,
        answers,
        timeTaken,
        subject: currentQuiz.subject,
      };

      const { data } = await api.post("/quiz/submit", payload);

      const results: QuizResults = {
        score: data.score,
        correctCount: data.correctCount,
        weakTopics: data.weakTopics || [],
        questionResults: data.questionResults || [],
        timeTaken,
      };

      const savedQuiz = data.quiz as Quiz;

      set((state) => ({
        results,
        currentQuiz: savedQuiz,
        isSubmitting: false,
        history: state.history.map((q) =>
          q._id === savedQuiz._id ? savedQuiz : q,
        ),
      }));

      return results;
    } catch (error) {
      set({ isSubmitting: false });
      throw error;
    }
  },
}));

// ─── Tutor Store ────────────────────────────────────────
interface TutorState {
  messages: ChatMessage[];
  isLoading: boolean;
  subject: string;
  sendMessage: (content: string) => Promise<void>;
  setSubject: (subject: string) => void;
  clearChat: () => void;
}

export const useTutorStore = create<TutorState>((set, get) => ({
  messages: [],
  isLoading: false,
  subject: "General",

  sendMessage: async (content) => {
    const userMessage: ChatMessage = { role: "user", content };
    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
    }));

    try {
      const allMessages = [...get().messages];
      const { data } = await api.post("/tutor/chat", {
        messages: allMessages,
        subject: get().subject,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message,
      };
      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isLoading: false });
        return;
      }
      set({ isLoading: false });
    }
  },

  setSubject: (subject) => set({ subject }),
  clearChat: () => set({ messages: [], isLoading: false }),
}));
