import { create } from "zustand";

interface RateLimitState {
  remaining: number | null;
  limit: number | null;
  resetTime: Date | null;
  showAddKeyPrompt: boolean;
  setRateLimit: (remaining: number, limit: number, resetTime: Date | null) => void;
  clear: () => void;
}

export const useRateLimitStore = create<RateLimitState>((set) => ({
  remaining: null,
  limit: null,
  resetTime: null,
  showAddKeyPrompt: false,
  setRateLimit: (remaining, limit, resetTime) => {
    set({
      remaining: Number.isFinite(remaining) ? remaining : null,
      limit: Number.isFinite(limit) ? limit : null,
      resetTime,
    });
  },
  clear: () => set({ remaining: null, limit: null, resetTime: null }),
}));
