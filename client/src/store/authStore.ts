import { create } from "zustand";
import api from "@/lib/axios";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
  sessionExpired: false,

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    set({ user: data.user, isAuthenticated: true, sessionExpired: false });
  },

  demoLogin: async () => {
    const { data } = await api.post("/auth/demo-login");
    set({ user: data.user, isAuthenticated: true, sessionExpired: false });
  },

  signup: async (name, email, password) => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
    });
    set({ user: data.user, isAuthenticated: true, sessionExpired: false });
  },

  logout: async () => {
    await api.post("/auth/logout");
    set({ user: null, isAuthenticated: false, sessionExpired: false });
  },
  // Slice 44: session revocation (Backend M8) client. The server bumps
  // tokenVersion and clears the cookie, so every session dies; the
  // store clears state and ProtectedRoute navigates to /login.
  logoutEverywhere: async () => {
    await api.post("/auth/logout-everywhere");
    set({ user: null, isAuthenticated: false, sessionExpired: false });
  },

  // On success the server bumps tokenVersion and clears the cookie,
  // so this session is dead too: state clears and the user logs in
  // again with the new password. On failure the error is rethrown for
  // the caller to surface, and auth state is left untouched — a wrong
  // current password is a 400 (slice 44 server change), never a 401,
  // so it cannot trip the global session-expired handler.
  changePassword: async (currentPassword, newPassword) => {
    await api.post("/auth/change-password", { currentPassword, newPassword });
    set({ user: null, isAuthenticated: false, sessionExpired: false });
  },

  checkAuth: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({
        user: data.user,
        isAuthenticated: Boolean(data.user),
        isLoading: false,
        sessionExpired: false,
      });
    } catch (error: any) {
      // Only clear the user if the server explicitly says the token is invalid (401).
      // sessionExpired is deliberately left untouched here: the axios 401
      // listener (handleSessionExpired) may have just set it, and clearing
      // it would erase the "session expired" notice on the login page.
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

// Frontend M7: runs when the axios interceptor reports a 401. It clears
// auth state without reloading the page, so ProtectedRoute navigates to
// /login through React Router and in-memory store state survives. It is a
// no-op when there is no logged-in user (a failed login attempt or a fresh
// visitor hitting /auth/me must not raise a spurious "session expired"
// notice on the login page).
export function handleSessionExpired(): void {
  const state = useAuthStore.getState();
  if (!state.user) return;
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    sessionExpired: true,
  });
}
