import { create } from "zustand";
import api from "@/lib/axios";
import { openApiKeyGate } from "@/lib/apiKeyGate";

export type TutorRole = "user" | "assistant";
export type TutorMode = "explain" | "socratic";

export interface TutorMessage {
  id: string;
  role: TutorRole;
  content: string;
  followUps?: string[];
  createdAt: string;
}

export interface TutorSessionStub {
  _id: string;
  name?: string;
  subject: string;
  context: string;
  promptPreview: string;
  responsePreview: string;
  followUps: string[];
  messageCount: number;
  messagesSnapshot?: Array<{
    role: TutorRole;
    content: string;
    followUps?: string[];
    createdAt?: string;
  }>;
  createdAt: string;
}

export interface TutorNote {
  _id: string;
  title: string;
  subject: string;
  content: string;
}

interface ConversationState {
  context: string;
  mode: TutorMode;
  activeSessionName: string | null;
  activeSessionId: string | null;
  messages: TutorMessage[];
  sessions: TutorSessionStub[];
  selectedNoteIds: string[];
  selectedNotes: TutorNote[];
  availableNotes: TutorNote[];
  isSavingNotes: boolean;
  isStreaming: boolean;
  flashcardsSaved: number;
  setContext: (context: string) => void;
  setMode: (mode: TutorMode) => void;
  setActiveSessionId: (id: string | null) => void;
  setActiveSessionName: (name: string | null) => void;
  newConversation: () => void;
  loadSessions: () => Promise<void>;
  loadSessionConversation: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  fetchNotesForTutor: () => Promise<void>;
  loadSessionNotes: (sessionId: string) => Promise<void>;
  fetchAndRestoreNotes: () => Promise<void>;
  selectNote: (noteId: string) => Promise<void>;
  clearNotes: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  saveFlashcard: (
    question: string,
    answer: string,
    subject: string,
  ) => Promise<void>;
  addToNotes: (
    title: string,
    content: string,
    subject: string,
  ) => Promise<void>;
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function stripHtml(html = "") {
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

export const useConversationStore = create<ConversationState>((set, get) => ({
  context: "",
  mode: "explain",
  activeSessionName: null,
  activeSessionId: null,
  messages: [],
  sessions: [],
  selectedNoteIds: [],
  selectedNotes: [],
  availableNotes: [],
  isSavingNotes: false,
  isStreaming: false,
  flashcardsSaved: 0,

  setContext: (context) => set({ context }),
  setMode: (mode) => set({ mode }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveSessionName: (name) => set({ activeSessionName: name }),

  newConversation: () =>
    set({
      messages: [],
      selectedNoteIds: [],
      selectedNotes: [],
      activeSessionId: null,
      activeSessionName: null,
      isStreaming: false,
    }),

  loadSessions: async () => {
    try {
      const { data } = await api.get("/tutor/sessions");
      set({ sessions: data.sessions || [] });
    } catch {
      set({ sessions: [] });
    }
  },

  loadSessionConversation: async (sessionId) => {
    const { sessions } = get();
    const session = sessions.find((item) => item._id === sessionId);
    if (!session) return;

    const messagesFromSnapshot = (session.messagesSnapshot || []).map(
      (msg) => ({
        id: makeId(),
        role: msg.role,
        content: msg.content,
        followUps: msg.followUps || [],
        createdAt: msg.createdAt || new Date().toISOString(),
      }),
    );

    const fallbackMessages: TutorMessage[] = [];
    if (messagesFromSnapshot.length === 0) {
      if (session.promptPreview) {
        fallbackMessages.push({
          id: makeId(),
          role: "user",
          content: session.promptPreview,
          createdAt: session.createdAt,
        });
      }

      if (session.responsePreview) {
        fallbackMessages.push({
          id: makeId(),
          role: "assistant",
          content: session.responsePreview,
          followUps: session.followUps || [],
          createdAt: session.createdAt,
        });
      }
    }

    set({
      activeSessionId: sessionId,
      activeSessionName:
        session.name ||
        session.promptPreview?.slice(0, 48) ||
        "New Conversation",
      context: session.context || "",
      messages:
        messagesFromSnapshot.length > 0
          ? messagesFromSnapshot
          : fallbackMessages,
      isStreaming: false,
    });
  },

  renameSession: async (sessionId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const { data } = await api.patch(`/tutor/sessions/${sessionId}/rename`, {
      name: trimmed,
    });

    set((state) => ({
      activeSessionName:
        state.activeSessionId === sessionId
          ? data.session?.name || trimmed
          : state.activeSessionName,
      sessions: state.sessions.map((session) =>
        session._id === sessionId
          ? { ...session, name: data.session?.name || trimmed }
          : session,
      ),
    }));
  },

  fetchNotesForTutor: async () => {
    try {
      const { data } = await api.get("/notes", {
        params: { deleted: false },
      });

      set({ availableNotes: data.notes || [] });
    } catch {
      set({ availableNotes: [] });
    }
  },

  loadSessionNotes: async (sessionId) => {
    set({ isSavingNotes: true });

    try {
      const response = await api.get(`/tutor/sessions/${sessionId}/notes`);
      const notes: TutorNote[] = response.data.notes || [];

      set({
        selectedNotes: notes,
        selectedNoteIds: notes.map((note) => note._id),
        isSavingNotes: false,
      });
    } catch (err) {
      console.error("Failed to load session notes:", err);
      set({ selectedNotes: [], selectedNoteIds: [], isSavingNotes: false });
    }
  },

  fetchAndRestoreNotes: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    await get().loadSessionNotes(activeSessionId);
  },

  selectNote: async (noteId) => {
    const { activeSessionId, selectedNoteIds, availableNotes, selectedNotes } =
      get();

    const exists = selectedNoteIds.includes(noteId);
    const newIds = exists
      ? selectedNoteIds.filter((id) => id !== noteId)
      : [...selectedNoteIds, noteId];

    const noteMap = new Map<string, TutorNote>();
    [...selectedNotes, ...availableNotes].forEach((note) => {
      noteMap.set(note._id, note);
    });

    const newSelectedNotes = newIds
      .map((id) => noteMap.get(id))
      .filter((note): note is TutorNote => Boolean(note));

    set({
      selectedNoteIds: newIds,
      selectedNotes: newSelectedNotes,
      isSavingNotes: Boolean(activeSessionId),
    });

    if (!activeSessionId) {
      set({ isSavingNotes: false });
      return;
    }

    try {
      await api.patch(`/tutor/sessions/${activeSessionId}/notes`, {
        noteIds: newIds,
      });
      set({ isSavingNotes: false });
    } catch (err) {
      console.error("Failed to save note selection:", err);
      set({ selectedNoteIds, selectedNotes, isSavingNotes: false });
    }
  },

  clearNotes: async () => {
    const { activeSessionId } = get();

    set({
      selectedNoteIds: [],
      selectedNotes: [],
      isSavingNotes: Boolean(activeSessionId),
    });

    if (!activeSessionId) {
      set({ isSavingNotes: false });
      return;
    }

    try {
      await api.patch(`/tutor/sessions/${activeSessionId}/notes`, {
        noteIds: [],
      });
    } catch (err) {
      console.error("Failed to clear notes:", err);
    } finally {
      set({ isSavingNotes: false });
    }
  },

  deleteSession: async (id) => {
    try {
      await api.delete(`/tutor/sessions/${id}`);
      set((state) => ({
        sessions: state.sessions.filter((session) => session._id !== id),
        messages: state.activeSessionId === id ? [] : state.messages,
        activeSessionId:
          state.activeSessionId === id ? null : state.activeSessionId,
        activeSessionName:
          state.activeSessionId === id ? null : state.activeSessionName,
      }));
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  },

  sendMessage: async (content) => {
    const state = get();
    if (!content.trim() || state.isStreaming) return;

    const userMessage: TutorMessage = {
      id: makeId(),
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    const assistantId = makeId();
    const assistantMessage: TutorMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      followUps: [],
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...state.messages, userMessage, assistantMessage];
    const previousMessages = state.messages;

    set({
      messages: nextMessages,
      isStreaming: true,
    });

    const payloadMessages = [...state.messages, userMessage]
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .map((msg) => ({ role: msg.role, content: msg.content }));

    const noteContext = state.selectedNotes
      .map((note) => {
        const stripped = stripHtml(note.content || "").trim();
        if (stripped.length < 10) return null;

        return `=== NOTE: ${note.title} ===\n${stripped}\n=== END NOTE ===`;
      })
      .filter((note): note is string => Boolean(note))
      .join("\n\n")
      .trim();
    const requestSessionId = state.activeSessionId || undefined;

    try {
      const response = await fetch("/api/tutor/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: payloadMessages,
          context: state.context || undefined,
          noteContext: noteContext || undefined,
          activeSessionId: requestSessionId,
          mode: get().mode,
        }),
      });

      if (response.status === 402) {
        openApiKeyGate(true);
        throw Object.assign(new Error("No API key configured"), { status: 402 });
      }

      if (!response.ok || !response.body) {
        throw new Error(`Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const appendAssistantText = (token: string) => {
        set((prev) => ({
          messages: prev.messages.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: `${msg.content}${token}` }
              : msg,
          ),
        }));
      };

      const completeAssistantMessage = (
        finalContent: string,
        followUps: string[],
      ) => {
        set((prev) => ({
          messages: prev.messages.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: finalContent || msg.content,
                  followUps: Array.isArray(followUps) ? followUps : [],
                }
              : msg,
          ),
        }));
      };

      const processEventBlock = async (block: string) => {
        const lines = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const eventLine = lines.find((line) => line.startsWith("event:"));
        const dataLine = lines.find((line) => line.startsWith("data:"));

        const eventName = eventLine?.replace("event:", "").trim() || "message";
        const dataPayload = dataLine?.replace("data:", "").trim() || "{}";

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(dataPayload);
        } catch {
          // Ignore malformed chunks only.
          return;
        }

        if (eventName === "error") {
          throw new Error(
            typeof parsed.error === "string"
              ? parsed.error
              : "Streaming failed",
          );
        }

        if (eventName === "token" && typeof parsed.token === "string") {
          appendAssistantText(parsed.token);
        }

        if (eventName === "complete") {
          const completeContent =
            typeof parsed.content === "string" ? parsed.content : "";
          const completeFollowUps = Array.isArray(parsed.followUps)
            ? parsed.followUps.filter(
                (item): item is string => typeof item === "string",
              )
            : [];

          completeAssistantMessage(completeContent, completeFollowUps);

          set((prev) => ({
            activeSessionId:
              prev.activeSessionId ||
              (typeof parsed.sessionId === "string" ? parsed.sessionId : null),
            activeSessionName:
              prev.activeSessionName ||
              (typeof parsed.name === "string" ? parsed.name : "") ||
              payloadMessages[0]?.content?.slice(0, 48) ||
              "New Conversation",
          }));

          const sessionId =
            requestSessionId ||
            (typeof parsed.sessionId === "string" ? parsed.sessionId : null);
          const { selectedNoteIds } = get();

          if (selectedNoteIds.length > 0 && sessionId) {
            await api.patch(`/tutor/sessions/${sessionId}/notes`, {
              noteIds: selectedNoteIds,
            });
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let splitIndex = buffer.indexOf("\n\n");
        while (splitIndex !== -1) {
          const block = buffer.slice(0, splitIndex);
          buffer = buffer.slice(splitIndex + 2);
          await processEventBlock(block);
          splitIndex = buffer.indexOf("\n\n");
        }
      }

      if (buffer.trim().length > 0) {
        await processEventBlock(buffer);
      }

      await get().loadSessions();
    } catch (error: any) {
      if (error?.status === 402) {
        set({ messages: previousMessages });
      } else {
        set((prev) => ({
          messages: prev.messages.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content:
                    msg.content ||
                    "I couldn’t complete that response. Please try again.",
                }
              : msg,
          ),
        }));
      }
      console.error("Tutor streaming error:", error);
    } finally {
      set({ isStreaming: false });
    }
  },

  saveFlashcard: async (question, answer, subject) => {
    await api.post("/tutor/save-flashcard", {
      question,
      answer,
      subject,
    });

    set((state) => ({ flashcardsSaved: state.flashcardsSaved + 1 }));
  },

  addToNotes: async (title, content, subject) => {
    await api.post("/notes", {
      title,
      content,
      subject,
      sourceType: "ai",
    });
  },
}));
