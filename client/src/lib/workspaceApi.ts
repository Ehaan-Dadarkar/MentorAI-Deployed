import api from "@/lib/axios";
import type { Note } from "@/types";

export interface NoteQueryParams {
  deleted?: boolean;
  subject?: string;
  search?: string;
}

export interface UpdateNotePayload {
  title?: string;
  content?: string;
  subject?: string;
  tags?: string[];
  summary?: string;
  sections?: Array<{ heading: string; content: string }>;
  keyTerms?: Array<{ term: string; definition: string }>;
}

export async function fetchNotes(params?: NoteQueryParams) {
  const { data } = await api.get<{ notes: Note[] }>("/notes", { params });
  return data.notes || [];
}

export async function fetchNoteById(noteId: string) {
  const { data } = await api.get<{ note: Note }>(`/notes/${noteId}`);
  return data.note;
}

export async function createNote(payload: {
  title: string;
  content?: string;
  subject?: string;
  tags?: string[];
  sourceType?: "manual" | "pdf" | "ai";
}) {
  const { data } = await api.post<{ note: Note }>("/notes", payload);
  return data.note;
}

export async function updateNoteById(noteId: string, payload: UpdateNotePayload) {
  const { data } = await api.put<{ note: Note }>(`/notes/${noteId}`, payload);
  return data.note;
}

export async function moveNoteToTrash(noteId: string) {
  const { data } = await api.delete<{ note?: Note; message?: string }>(`/notes/${noteId}`);
  return data.note || null;
}

export async function restoreNoteById(noteId: string) {
  const { data } = await api.patch<{ note: Note }>(`/notes/${noteId}/restore`);
  return data.note;
}

export async function permanentlyDeleteNote(noteId: string) {
  await api.delete(`/notes/${noteId}/permanent`);
}

export async function uploadPdfNote(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<{ note: Note }>("/upload/pdf", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data.note;
}
