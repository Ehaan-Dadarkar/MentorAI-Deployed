import { create } from "zustand";
import type { Note } from "@/types";
import {
  createNote as createNoteApi,
  fetchNoteById,
  fetchNotes,
  moveNoteToTrash,
  permanentlyDeleteNote,
  restoreNoteById,
  updateNoteById,
  uploadPdfNote,
} from "@/lib/workspaceApi";

interface WorkspaceFilters {
  search: string;
  subject: string | null;
}

interface WorkspaceState {
  notes: Note[];
  trashNotes: Note[];
  activeNote: Note | null;
  editorContent: string;
  filters: WorkspaceFilters;
  isLoading: boolean;
  isSaving: boolean;
  isImportingPdf: boolean;
  lastSavedAt: string | null;

  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  setActiveNote: (note: Note | null) => void;
  updateEditorContent: (content: string) => void;
  updateNote: (note: Note) => void;
  deleteNote: (noteId: string) => Promise<void>;
  restoreNote: (noteId: string) => Promise<void>;

  fetchWorkspaceData: () => Promise<void>;
  loadNote: (noteId: string) => Promise<void>;
  setSearch: (search: string) => void;
  setSubjectFilter: (subject: string | null) => void;

  createNote: (payload?: Partial<Pick<Note, "title" | "subject" | "content">>) => Promise<Note>;
  saveActiveNote: (payload?: Partial<Pick<Note, "title" | "content" | "subject">>) => Promise<void>;
  importPdf: (file: File) => Promise<Note>;

  deletePermanently: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  notes: [],
  trashNotes: [],
  activeNote: null,
  editorContent: "",
  filters: {
    search: "",
    subject: null,
  },
  isLoading: false,
  isSaving: false,
  isImportingPdf: false,
  lastSavedAt: null,

  setNotes: (notes) => set({ notes }),

  addNote: (note) =>
    set((state) => ({
      notes: [note, ...state.notes.filter((entry) => entry._id !== note._id)],
    })),

  setActiveNote: (note) =>
    set({
      activeNote: note,
      editorContent: note?.content || "",
    }),

  updateEditorContent: (content) => set({ editorContent: content }),

  updateNote: (note) =>
    set((state) => ({
      notes: state.notes.map((entry) => (entry._id === note._id ? note : entry)),
      activeNote: state.activeNote?._id === note._id ? note : state.activeNote,
      editorContent: state.activeNote?._id === note._id ? note.content || state.editorContent : state.editorContent,
      lastSavedAt: note.updatedAt,
    })),

  deleteNote: async (noteId) => {
    await moveNoteToTrash(noteId);

    set((state) => {
      const trashedNote = state.notes.find((note) => note._id === noteId) || null;

      return {
        notes: state.notes.filter((note) => note._id !== noteId),
        trashNotes: trashedNote
          ? [{ ...trashedNote, isDeleted: true, deleted: true }, ...state.trashNotes]
          : state.trashNotes,
        activeNote: state.activeNote?._id === noteId ? null : state.activeNote,
        editorContent: state.activeNote?._id === noteId ? "" : state.editorContent,
      };
    });
  },

  restoreNote: async (noteId) => {
    const restored = await restoreNoteById(noteId);
    set((state) => ({
      trashNotes: state.trashNotes.filter((note) => note._id !== noteId),
      notes: [restored, ...state.notes.filter((note) => note._id !== noteId)],
    }));
  },

  fetchWorkspaceData: async () => {
    set({ isLoading: true });
    try {
      const { filters } = get();

      const activeQuery = {
        search: filters.search || undefined,
        subject: filters.subject || undefined,
        deleted: false,
      };

      const [activeNotes, trashNotes] = await Promise.all([
        fetchNotes(activeQuery),
        fetchNotes({ deleted: true }),
      ]);

      set({
        notes: activeNotes,
        trashNotes,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  loadNote: async (noteId) => {
    set({ isLoading: true });
    try {
      const note = await fetchNoteById(noteId);
      set({
        activeNote: note,
        editorContent: note.content || "",
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setSearch: (search) => set((state) => ({ filters: { ...state.filters, search } })),

  setSubjectFilter: (subject) =>
    set((state) => ({
      filters: { ...state.filters, subject },
    })),

  createNote: async (payload) => {
    const created = await createNoteApi({
      title: payload?.title || "Untitled Note",
      subject: payload?.subject || "General",
      content: payload?.content || "",
      sourceType: "manual",
    });

    set((state) => ({
      notes: [created, ...state.notes.filter((note) => note._id !== created._id)],
      activeNote: created,
      editorContent: created.content || "",
      lastSavedAt: created.updatedAt,
    }));

    return created;
  },

  saveActiveNote: async (payload) => {
    const { activeNote, editorContent } = get();
    if (!activeNote) return;

    set({ isSaving: true });
    try {
      const requestBody = {
        ...payload,
        ...(payload?.content === undefined ? { content: editorContent } : {}),
      };

      const updated = await updateNoteById(activeNote._id, requestBody);

      set((state) => ({
        activeNote: updated,
        editorContent: updated.content || state.editorContent,
        notes: state.notes.map((note) => (note._id === updated._id ? updated : note)),
        isSaving: false,
        lastSavedAt: updated.updatedAt,
      }));
    } catch (error) {
      set({ isSaving: false });
      throw error;
    }
  },

  importPdf: async (file) => {
    set({ isImportingPdf: true });
    try {
      const note = await uploadPdfNote(file);
      set((state) => ({
        notes: [note, ...state.notes.filter((entry) => entry._id !== note._id)],
        activeNote: note,
        editorContent: note.content || "",
        lastSavedAt: note.updatedAt,
        isImportingPdf: false,
      }));

      return note;
    } catch (error) {
      set({ isImportingPdf: false });
      throw error;
    }
  },

  deletePermanently: async (id) => {
    await permanentlyDeleteNote(id);
    set((state) => ({
      trashNotes: state.trashNotes.filter((n) => n._id !== id),
    }));
  },
}));
