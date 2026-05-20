// ─── User ───────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  subjects: string[];
  studyGoalMinutes: number;
  streak: number;
  weakTopics?: string[];
  openrouterApiKey?: string;
  hasOpenrouterApiKey?: boolean;
  isDemo?: boolean;
}

// ─── Deck & Flashcard ───────────────────────────────────
export interface Deck {
  _id: string;
  userId: string;
  name: string;
  subject: string;
  cardCount: number;
  masteryAvg: number;
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  _id: string;
  deckId: string;
  userId: string;
  question: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  mastery: number;
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReview: string;
  lastReviewed: string | null;
}

// ─── Note ───────────────────────────────────────────────
export interface Note {
  _id: string;
  userId: string;
  title: string;
  content: string;
  summary?: string;
  sections?: Array<{
    heading: string;
    content: string;
  }>;
  keyTerms?: Array<{
    term: string;
    definition: string;
  }>;
  subject: string;
  tags: string[];
  sourceType: "manual" | "pdf" | "ai";
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  deleted?: boolean;
}

// ─── Quiz ───────────────────────────────────────────────
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  userAnswer: number | null;
  explanation: string;
  topic: string;
}

export interface Quiz {
  _id: string;
  userId: string;
  subject: string;
  deckName?: string;
  deckId?: string | null;
  questions: QuizQuestion[];
  score: number | null;
  timeTaken: number | null;
  weakTopics: string[];
  completedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ─── Voice Recall ───────────────────────────────────────
export interface VoiceResponse {
  question: string;
  expectedConcepts: string[];
  userResponse: string;
  score: number;
  feedback: string;
  speechCorrections?: Array<{
    heard: string;
    intended: string;
    context: string;
  }>;
}

export interface VoiceSession {
  _id: string;
  userId: string;
  noteId: string | null;
  subject: string;
  questions: string[];
  responses: VoiceResponse[];
  avgScore: number;
  weakConcepts: string[];
  completedAt: string | null;
}

// ─── Study Session ──────────────────────────────────────
export interface StudySession {
  _id: string;
  userId: string;
  type: "flashcard" | "quiz" | "voice" | "tutor";
  subject: string;
  durationMinutes: number;
  date: string;
}

// ─── Chat ───────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Dashboard Stats ────────────────────────────────────
export interface DashboardStats {
  totalStudyMinutes: number;
  streak: number;
  cardsReviewed: number;
  quizzesCompleted: number;
  avgQuizScore: number;
  dueCards: number;
  weeklyStudy: { day: string; minutes: number }[];
  masteryBySubject: { subject: string; mastery: number }[];
}

// ─── Knowledge Graph ─────────────────────────────────────
export type KnowledgeGraphNodeType =
  | "note"
  | "concept"
  | "quiz"
  | "flashcard"
  | "voice";

export type KnowledgeGraphEdgeType =
  | "contains"
  | "generated"
  | "practiced"
  | "concept-link";

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: KnowledgeGraphNodeType;
  subject: string;
  mastery: number;
  frequency: number;
  noteId?: string;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  type: KnowledgeGraphEdgeType;
  relationship: string;
}

export interface KnowledgeGraphMeta {
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  usedAI: boolean;
  truncated: boolean;
  nodeTypes: {
    note: number;
    concept: number;
    quiz: number;
    flashcard: number;
    voice: number;
  };
  edgeTypes: {
    contains: number;
    generated: number;
    practiced: number;
    "concept-link": number;
  };
}

// ─── API Response ───────────────────────────────────────
export interface ApiError {
  error: string;
  details?: { field: string; message: string }[];
}
