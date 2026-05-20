import { create } from "zustand";

const RECENT_KEY = "mentorai-nexus-recent";
const MAX_RECENT = 5;

export interface RecentItem {
  id: string;
  label: string;
  timestamp: number;
}

interface NexusState {
  isOpen: boolean;
  recentItems: RecentItem[];
  openNexus: () => void;
  closeNexus: () => void;
  toggleNexus: () => void;
  addRecent: (id: string, label: string) => void;
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export const useNexusStore = create<NexusState>((set, get) => ({
  isOpen: false,
  recentItems: loadRecent(),

  openNexus: () => set({ isOpen: true }),
  closeNexus: () => set({ isOpen: false }),
  toggleNexus: () => set((s) => ({ isOpen: !s.isOpen })),

  addRecent: (id, label) => {
    const current = get().recentItems.filter((r) => r.id !== id);
    const next = [{ id, label, timestamp: Date.now() }, ...current].slice(
      0,
      MAX_RECENT,
    );
    saveRecent(next);
    set({ recentItems: next });
  },
}));
