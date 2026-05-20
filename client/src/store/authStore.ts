import { create } from "zustand";
import api from "@/lib/axios";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (
    data: Partial<
      Pick<User, "name" | "subjects" | "studyGoalMinutes" | "openrouterApiKey">
    >,
  ) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    set({ user: data.user, isAuthenticated: true });
  },

  signup: async (name, email, password) => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
    });
    set({ user: data.user, isAuthenticated: true });
  },

  logout: async () => {
    await api.post("/auth/logout");
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({
        user: data.user,
        isAuthenticated: Boolean(data.user),
        isLoading: false,
      });
    } catch (error: any) {
      // Only clear the user if the server explicitly says the token is invalid (401).
      if (error?.response?.status === 401) {
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        // For network/CORS/timeout errors, keep current user state but mark loading complete.
        set({ isLoading: false });
      }
    }
  },

  updateProfile: async (updates) => {
    const { data } = await api.patch("/auth/profile", updates);
    set({ user: data.user });
  },
}));
