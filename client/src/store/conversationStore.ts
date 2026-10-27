import { create } from "zustand";
import api, { API_BASE_URL } from "@/lib/axios";
import { openApiKeyGate } from "@/lib/apiKeyGate";

export type TutorRole = "user" | "assistant";
export type TutorMode = "explain" | "socratic";

export interface TutorMessage {
  id: string;
  role: TutorRole;
  content: string;
  followUps?: string[];
  createdAt: string;
  // Set when a send failed with 402: the message stays in the thread,
  // marked unsent, so it can be retried after a key/credits are added.
  failed?: boolean;
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
  sessionSaveFailed: boolean;
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
  stopStreaming: () => void;
  retryMessage: (id: string) => Promise<void>;
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

// Tutor SSE stream control (Frontend M5): a single in-flight stream at a
// time. The controller lets the user stop a hung stream; the watchdog
// aborts it if no chunk arrives - 90 s to the first byte (Render cold
// start + first token can be slow) and 45 s of inactivity after that.
// A generation counter keeps an old stream's cleanup from touching a
// newer stream started after a conversation reset.
let streamController: AbortController | null = null;
let streamWatchdog: ReturnType<typeof setTimeout> | null = null;
let streamStopReason: "stopped" | "timed-out" | null = null;
let streamGotFirstChunk = false;
let streamGeneration = 0;

const STREAM_FIRST_BYTE_TIMEOUT_MS = 90000;
const STREAM_INACTIVITY_TIMEOUT_MS = 45000;

function clearStreamWatchdog() {
  if (streamWatchdog !== null) {
    clearTimeout(streamWatchdog);
    streamWatchdog = null;
  }
}

function armStreamWatchdog(generation: number) {
  clearStreamWatchdog();
  const timeoutMs = streamGotFirstChunk
    ? STREAM_INACTIVITY_TIMEOUT_MS
    : STREAM_FIRST_BYTE_TIMEOUT_MS;
  streamWatchdog = setTimeout(() => {
    if (streamGeneration === generation && streamController) {
      streamStopReason = "timed-out";
      streamController.abort();
    }
  }, timeoutMs);
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
  sessionSaveFailed: false,
  flashcardsSaved: 0,

  setContext: (context) => set({ context }),
  setMode: (mode) => set({ mode }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveSessionName: (name) => set({ activeSessionName: name }),

  newConversation: () => {
    // A stream in flight belongs to the old thread: abort it so its
    // tokens cannot land in the new conversation.
    streamStopReason = "stopped";
    streamController?.abort();
    set({
      messages: [],
      selectedNoteIds: [],
      selectedNotes: [],
      activeSessionId: null,
      activeSessionName: null,
      isStreaming: false,
      sessionSaveFailed: false,
    });
  },

  stopStreaming: () => {
    if (!get().isStreaming) return;
    streamStopReason = "stopped";
    streamController?.abort();
  },

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
      sessionSaveFailed: false,
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
      sessionSaveFailed: false,
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
    const apiUrl = API_BASE_URL;

    const streamGen = ++streamGeneration;
    streamController = new AbortController();
    streamStopReason = null;
    streamGotFirstChunk = false;
    armStreamWatchdog(streamGen);

    // Batched token flush (M5 remainder): every SSE token used to call
    // set() directly, so every token re-rendered the whole thread and
    // re-parsed every message's markdown. Tokens now accumulate in a
    // local buffer and flush at most every 100 ms; the flush is forced
    // on completion, on error/stop, and when the stream ends, so no
    // token is ever lost or delayed past the end of the stream.
    // Declared OUTSIDE the try on purpose: const/let inside a try block
    // are invisible to its catch, and the catch flush (which saves a
    // stopped stream's partial answer) is the whole point of this change.
    let pendingText = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushAssistantText = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!pendingText) return;
      const text = pendingText;
      pendingText = "";
      set((prev) => ({
        messages: prev.messages.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `${msg.content}${text}` }
            : msg,
        ),
      }));
    };

    try {
      const response = await fetch(`${apiUrl}/api/tutor/chat`, {
        method: "POST",
        signal: streamController.signal,
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

      // Tokens accumulate in the buffer declared above the try and
      // flush at most every 100 ms (see flushAssistantText).
      const appendAssistantText = (token: string) => {
        pendingText += token;
        if (!flushTimer) {
          flushTimer = setTimeout(flushAssistantText, 100);
        }
      };

      const completeAssistantMessage = (
        finalContent: string,
        followUps: string[],
      ) => {
        // The server's final content supersedes any unflushed tokens:
        // discard the buffer instead of appending it after the final text.
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        pendingText = "";
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

          if (parsed.sessionSaveFailed === true) {
            set({ sessionSaveFailed: true });
          }

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

        // Any chunk proves the stream is alive: the first chunk moves
        // the watchdog from the 90 s first-byte budget to the 45 s
        // inactivity budget.
        if (!streamGotFirstChunk) streamGotFirstChunk = true;
        armStreamWatchdog(streamGen);

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

      // A stream that ends without a complete event still owes its
      // buffered tokens to the thread.
      flushAssistantText();

      await get().loadSessions();
    } catch (error: any) {
      // Flush first: the stop/error branches below read msg.content,
      // and a stopped stream's partial answer lives in the buffer
      // until this flush. Without it, a stop could drop the partial
      // answer as an "empty placeholder".
      flushAssistantText();
      const aborted =
        error?.name === "AbortError" || streamController?.signal.aborted === true;
      if (aborted) {
        // Stopped by the user (or by a conversation reset): keep any
        // partial answer, drop an empty placeholder. A watchdog
        // timeout that produced nothing is a failure, not a stop, so
        // it keeps the usual fallback text instead.
        if (streamStopReason === "timed-out") {
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
        } else {
          set((prev) => ({
            messages: prev.messages.filter(
              (msg) => !(msg.id === assistantId && !msg.content),
            ),
          }));
        }
      } else if (error?.status === 402) {
        // Keep the failed message in the thread, marked unsent, and
        // drop the empty assistant placeholder. The old code restored
        // previousMessages, deleting the message from both the thread
        // and the (already cleared) input. The api-key gate is opened
        // by the 402 branch above, so the user can add a key/credits
        // and retry from the thread.
        set({
          messages: [...previousMessages, { ...userMessage, failed: true }],
        });
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
      if (!aborted) {
        console.error("Tutor streaming error:", error);
      }
    } finally {
      // Only this stream's generation may clear the shared control
      // state: a newer stream started after a conversation reset
      // keeps its own controller and watchdog.
      if (streamGeneration === streamGen) {
        clearStreamWatchdog();
        streamController = null;
        streamStopReason = null;
      }
      set({ isStreaming: false });
    }
  },

  retryMessage: async (id) => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;
    const failed = messages.find((msg) => msg.id === id);
    if (!failed || failed.role !== "user" || !failed.failed) return;
    // The failed message never reached the server, so removing it and
    // re-sending appends it at the end of the thread in retry order.
    // A second 402 marks the re-sent message failed again, as above.
    set({ messages: messages.filter((msg) => msg.id !== id) });
    await get().sendMessage(failed.content);
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
