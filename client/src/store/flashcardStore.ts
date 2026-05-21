import { create } from "zustand";
import api from "@/lib/axios";
import { openApiKeyGate } from "@/lib/apiKeyGate";
import type { Deck, Flashcard, Note } from "@/types";

export type ReviewGrade = "missed" | "almost" | "got_it";

export interface DeckStats {
  totalCards: number;
  dueCards: number;
  masteredCards: number;
}

export interface DeckWithStats extends Deck {
  stats?: DeckStats;
}

interface SessionReviewResult {
  cardId: string;
  grade: ReviewGrade;
  previousMastery: number;
  nextMastery: number;
}

export interface SessionResults {
  startedAt: string;
  endedAt: string | null;
  cardsReviewed: number;
  correctCount: number;
  accuracy: number;
  masteryBeforeAvg: number;
  masteryAfterAvg: number;
  missedCardIds: string[];
  reviews: SessionReviewResult[];
}

export interface FlashcardStats {
  currentStreak: number;
  longestStreak: number;
  heatmapData: Array<{ date: string; count: number }>;
  milestones: {
    totalMastered: number;
    totalReviewed: number;
    totalDecks: number;
  };
}

interface WeakCardInput {
  question: string;
  answer: string;
  mastery: number;
}

interface FlashcardState {
  // Core state
  decks: DeckWithStats[];
  currentDeck: DeckWithStats | null;
  cards: Flashcard[];
  dueCards: Flashcard[];
  sessionCards: Flashcard[];
  sessionResults: SessionResults | null;
  isLoading: boolean;
  isGenerating: boolean;
  notesForGeneration: Note[];

  // Analytics & AI state
  stats: FlashcardStats | null;
  weakCards: Flashcard[];
  aiSuggestion: string | null;
  isFetchingStats: boolean;
  isFetchingWeak: boolean;

  // Core actions
  fetchDecks: () => Promise<void>;
  createDeck: (name: string, subject: string) => Promise<Deck>;
  deleteDeck: (id: string) => Promise<void>;
  loadDeck: (deckId: string) => Promise<void>;
  fetchDueCards: () => Promise<void>;
  fetchNotesForGeneration: () => Promise<void>;
  addCard: (
    deckId: string,
    question: string,
    answer: string,
    difficulty?: string,
  ) => Promise<void>;
  addCardsBulk: (
    deckId: string,
    cards: { question: string; answer: string; difficulty?: string }[],
  ) => Promise<void>;
  startSession: (cards?: Flashcard[]) => void;
  reviewCard: (cardId: string, grade: ReviewGrade) => Promise<Flashcard>;
  finishSession: () => void;
  generateCards: (
    text: string,
    subject: string,
    deckId?: string,
  ) => Promise<{ deck: DeckWithStats; cards: Flashcard[] }>;
  generateFromWeak: (
    weakConcepts: string[],
    subject: string,
    deckId?: string,
  ) => Promise<{ deck: DeckWithStats; cards: Flashcard[] }>;

  // Analytics & AI actions
  fetchStats: () => Promise<void>;
  fetchWeakCards: (deckId: string) => Promise<void>;
  fetchAISuggestion: (weakCards: WeakCardInput[]) => Promise<void>;
  completeSession: (
    deckId: string,
    reviews: Array<{ cardId: string; grade: ReviewGrade }>,
  ) => Promise<void>;
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  // ── Initial state ─────────────────────────────────────────
  decks: [],
  currentDeck: null,
  cards: [],
  dueCards: [],
  sessionCards: [],
  sessionResults: null,
  isLoading: false,
  isGenerating: false,
  notesForGeneration: [],

  stats: null,
  weakCards: [],
  aiSuggestion: null,
  isFetchingStats: false,
  isFetchingWeak: false,

  // ── Core actions ──────────────────────────────────────────

  fetchDecks: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get("/flashcards/decks");
      set({ decks: data.decks || [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createDeck: async (name, subject) => {
    const { data } = await api.post("/flashcards/decks", { name, subject });
    set((state) => ({ decks: [data.deck, ...state.decks] }));
    return data.deck;
  },

  deleteDeck: async (id) => {
    await api.delete(`/flashcards/decks/${id}`);
    set((state) => ({
      decks: state.decks.filter((d) => d._id !== id),
      currentDeck: state.currentDeck?._id === id ? null : state.currentDeck,
      cards: state.currentDeck?._id === id ? [] : state.cards,
      sessionCards: state.currentDeck?._id === id ? [] : state.sessionCards,
      sessionResults:
        state.currentDeck?._id === id ? null : state.sessionResults,
      weakCards: state.currentDeck?._id === id ? [] : state.weakCards,
      aiSuggestion: state.currentDeck?._id === id ? null : state.aiSuggestion,
    }));
  },

  loadDeck: async (deckId) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`/flashcards/decks/${deckId}`);
      const fallbackDeck = get().decks.find((d) => d._id === deckId) || null;
      set({
        cards: data.cards || [],
        currentDeck: data.deck || fallbackDeck,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchDueCards: async () => {
    try {
      const { data } = await api.get("/flashcards/due");
      set({ dueCards: data.cards || [] });
    } catch {
      // silent fail
    }
  },

  fetchNotesForGeneration: async () => {
    try {
      const { data } = await api.get("/notes", {
        params: { deleted: false },
      });
      set({ notesForGeneration: data.notes || [] });
    } catch {
      set({ notesForGeneration: [] });
    }
  },

  addCard: async (deckId, question, answer, difficulty) => {
    const { data } = await api.post(`/flashcards/decks/${deckId}/cards`, {
      question,
      answer,
      difficulty,
    });
    set((state) => ({
      cards: [...state.cards, data.card],
      decks: state.decks.map((deck) =>
        deck._id === deckId
          ? {
              ...deck,
              cardCount: (deck.cardCount || 0) + 1,
              stats: {
                totalCards: (deck.stats?.totalCards ?? deck.cardCount ?? 0) + 1,
                dueCards: deck.stats?.dueCards ?? 0,
                masteredCards: deck.stats?.masteredCards ?? 0,
              },
            }
          : deck,
      ),
    }));
  },

  addCardsBulk: async (deckId, cards) => {
    const { data } = await api.post(`/flashcards/decks/${deckId}/cards/bulk`, {
      cards,
    });
    const addedCount = (data.cards || []).length;

    set((state) => ({
      cards: [...state.cards, ...(data.cards || [])],
      decks: state.decks.map((deck) =>
        deck._id === deckId
          ? {
              ...deck,
              cardCount: (deck.cardCount || 0) + addedCount,
              stats: {
                totalCards:
                  (deck.stats?.totalCards ?? deck.cardCount ?? 0) + addedCount,
                dueCards: deck.stats?.dueCards ?? 0,
                masteredCards: deck.stats?.masteredCards ?? 0,
              },
            }
          : deck,
      ),
    }));
  },

  startSession: (cards) => {
    const sessionCards = cards || get().cards;
    const masteryBeforeAvg =
      sessionCards.length > 0
        ? Math.round(
            sessionCards.reduce((sum, card) => sum + (card.mastery || 0), 0) /
              sessionCards.length,
          )
        : 0;

    set({
      sessionCards,
      sessionResults: {
        startedAt: new Date().toISOString(),
        endedAt: null,
        cardsReviewed: 0,
        correctCount: 0,
        accuracy: 0,
        masteryBeforeAvg,
        masteryAfterAvg: masteryBeforeAvg,
        missedCardIds: [],
        reviews: [],
      },
      aiSuggestion: null,
    });
  },

  reviewCard: async (cardId, grade) => {
    const priorCard = get().sessionCards.find((c) => c._id === cardId);

    set((state) => ({
      sessionResults: state.sessionResults
        ? {
            ...state.sessionResults,
            cardsReviewed: state.sessionResults.cardsReviewed + 1,
            correctCount:
              state.sessionResults.correctCount + (grade === "got_it" ? 1 : 0),
            accuracy:
              Math.round(
                ((state.sessionResults.correctCount +
                  (grade === "got_it" ? 1 : 0)) /
                  (state.sessionResults.cardsReviewed + 1)) *
                  100,
              ) || 0,
            missedCardIds:
              grade === "missed"
                ? Array.from(
                    new Set([...state.sessionResults.missedCardIds, cardId]),
                  )
                : state.sessionResults.missedCardIds,
            reviews: [
              ...state.sessionResults.reviews,
              {
                cardId,
                grade,
                previousMastery: priorCard?.mastery ?? 0,
                nextMastery: updatedCard.mastery,
              },
            ],
          }
        : null,
    }));

    try {
      const { data } = await api.post("/flashcards/review", { cardId, grade });

      const updatedCard = data.card as Flashcard;

      set((state) => ({
        cards: state.cards.map((c) => (c._id === cardId ? updatedCard : c)),
        dueCards: state.dueCards.filter((c) => c._id !== cardId),
        sessionCards: state.sessionCards.map((c) =>
          c._id === cardId ? updatedCard : c,
        ),
        sessionResults: state.sessionResults
          ? {
              ...state.sessionResults,
              reviews: state.sessionResults.reviews.map((review) =>
                review.cardId === cardId
                  ? {
                      ...review,
                      nextMastery: updatedCard.mastery,
                    }
                  : review,
              ),
            }
          : null,
      }));

      return updatedCard;
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
      }
      return priorCard as Flashcard;
    }
  },

  finishSession: () => {
    const { sessionCards, sessionResults } = get();
    if (!sessionResults) return;

    const masteryAfterAvg =
      sessionCards.length > 0
        ? Math.round(
            sessionCards.reduce((sum, card) => sum + (card.mastery || 0), 0) /
              sessionCards.length,
          )
        : 0;

    set({
      sessionResults: {
        ...sessionResults,
        endedAt: new Date().toISOString(),
        masteryAfterAvg,
      },
    });
  },

  generateCards: async (text, subject, deckId) => {
    set({ isGenerating: true });
    const { data } = await api.post("/flashcards/generate", {
      text,
      subject,
      deckId,
    });

    const generatedCards: Flashcard[] = data.cards || [];
    const generatedDeck: DeckWithStats = data.deck;

    set((state) => {
      const existingDeck = state.decks.find((d) => d._id === generatedDeck._id);
      const nextDecks = existingDeck
        ? state.decks.map((d) =>
            d._id === generatedDeck._id
              ? {
                  ...d,
                  ...generatedDeck,
                  cardCount: (d.cardCount || 0) + generatedCards.length,
                }
              : d,
          )
        : [generatedDeck, ...state.decks];

      return {
        isGenerating: false,
        decks: nextDecks,
        currentDeck:
          state.currentDeck?._id === generatedDeck._id
            ? {
                ...(state.currentDeck || generatedDeck),
                ...generatedDeck,
                cardCount:
                  (state.currentDeck?.cardCount || 0) + generatedCards.length,
              }
            : state.currentDeck,
        cards:
          state.currentDeck?._id === generatedDeck._id
            ? [...state.cards, ...generatedCards]
            : state.cards,
      };
    });

    return { deck: generatedDeck, cards: generatedCards };
  },

  generateFromWeak: async (weakConcepts, subject, deckId) => {
    set({ isGenerating: true });
    const { data } = await api.post("/flashcards/generate-from-weak", {
      weakConcepts,
      subject,
      deckId,
    });

    const generatedCards: Flashcard[] = data.cards || [];
    const generatedDeck: DeckWithStats = data.deck;

    set((state) => {
      const existingDeck = state.decks.find((d) => d._id === generatedDeck._id);
      const nextDecks = existingDeck
        ? state.decks.map((d) =>
            d._id === generatedDeck._id
              ? {
                  ...d,
                  ...generatedDeck,
                  cardCount: (d.cardCount || 0) + generatedCards.length,
                }
              : d,
          )
        : [generatedDeck, ...state.decks];

      return {
        isGenerating: false,
        decks: nextDecks,
        currentDeck:
          state.currentDeck?._id === generatedDeck._id
            ? {
                ...(state.currentDeck || generatedDeck),
                ...generatedDeck,
                cardCount:
                  (state.currentDeck?.cardCount || 0) + generatedCards.length,
              }
            : state.currentDeck,
        cards:
          state.currentDeck?._id === generatedDeck._id
            ? [...state.cards, ...generatedCards]
            : state.cards,
      };
    });

    return { deck: generatedDeck, cards: generatedCards };
  },

  // ── Analytics & AI actions ────────────────────────────────

  fetchStats: async () => {
    set({ isFetchingStats: true });
    try {
      const { data } = await api.get("/flashcards/stats");
      set({ stats: data.stats || null, isFetchingStats: false });
    } catch {
      set({ isFetchingStats: false, stats: null });
    }
  },

  fetchWeakCards: async (deckId) => {
    set({ isFetchingWeak: true, aiSuggestion: null });
    try {
      const { data } = await api.get(`/flashcards/decks/${deckId}/weak`);
      set({ weakCards: data.cards || [], isFetchingWeak: false });
    } catch {
      set({ weakCards: [], isFetchingWeak: false });
    }
  },

  fetchAISuggestion: async (weakCards) => {
    if (!weakCards.length) {
      set({ aiSuggestion: null });
      return;
    }

    set({ aiSuggestion: null });
    try {
      const { data } = await api.post("/flashcards/ai-suggest", { weakCards });
      set({ aiSuggestion: data.suggestion || null });
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        return;
      }
      set({ aiSuggestion: null });
    }
  },

  completeSession: async (deckId, reviews) => {
    await api.post("/flashcards/session/complete", {
      deckId,
      reviews,
      totalReviewed: reviews.length,
    });
    await get().fetchDecks();
  },
}));
