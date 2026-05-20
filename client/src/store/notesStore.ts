import { create } from "zustand";
import api from "@/lib/axios";
import type { Note } from "@/types";

interface NotesState {
  notes: Note[];
  currentNote: Note | null;
  isLoading: boolean;
  fetchNotes: (params?: {
    deleted?: boolean;
    subject?: string;
    search?: string;
  }) => Promise<void>;
  fetchNote: (id: string) => Promise<void>;
  createNote: (data: {
    title: string;
    content?: string;
    subject?: string;
    tags?: string[];
    sourceType?: string;
  }) => Promise<Note>;
  updateNote: (id: string, data: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentDeleteNote: (id: string) => Promise<void>;
  setCurrentNote: (note: Note | null) => void;
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  currentNote: null,
  isLoading: false,

  fetchNotes: async (params) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get("/notes", { params });
      set({ notes: data.notes, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchNote: async (id) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`/notes/${id}`);
      set({ currentNote: data.note, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createNote: async (noteData) => {
    const { data } = await api.post("/notes", noteData);
    set((state) => ({ notes: [data.note, ...state.notes] }));
    return data.note;
  },

  updateNote: async (id, updates) => {
    const { data } = await api.patch(`/notes/${id}`, updates);
    set((state) => ({
      notes: state.notes.map((n) => (n._id === id ? data.note : n)),
      currentNote:
        state.currentNote?._id === id ? data.note : state.currentNote,
    }));
  },

  deleteNote: async (id) => {
    await api.delete(`/notes/${id}`);
    set((state) => ({
      notes: state.notes.filter((n) => n._id !== id),
      currentNote: state.currentNote?._id === id ? null : state.currentNote,
    }));
  },

  restoreNote: async (id) => {
    const { data } = await api.patch(`/notes/${id}/restore`);
    set((state) => ({
      notes: state.notes.filter((n) => n._id !== id),
      currentNote: data.note,
    }));
  },

  permanentDeleteNote: async (id) => {
    await api.delete(`/notes/${id}/permanent`);
    set((state) => ({
      notes: state.notes.filter((n) => n._id !== id),
    }));
  },

  setCurrentNote: (note) => set({ currentNote: note }),
}));
