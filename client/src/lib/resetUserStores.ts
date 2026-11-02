import { useConversationStore } from "@/store/conversationStore";
import { useFlashcardStore } from "@/store/flashcardStore";
import { useCreditsStore } from "@/store/creditsStore";
import { useVoiceRecallStore } from "@/store/voiceRecallStore";
import { useKnowledgeGraphStore } from "@/store/knowledgeGraphStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useQuizStore } from "@/store/appStore";

/**
 * Drop all user-scoped store state. Called on every auth transition
 * (logout, logout-everywhere, password change, session expiry / 401)
 * so the next account on a shared device never briefly sees the
 * previous user's notes, threads, decks, quizzes, or balance.
 */
export function resetUserStores(): void {
  useConversationStore.getState().reset();
  useFlashcardStore.getState().reset();
  useCreditsStore.getState().reset();
  useVoiceRecallStore.getState().reset();
  useKnowledgeGraphStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useQuizStore.getState().reset();
}
