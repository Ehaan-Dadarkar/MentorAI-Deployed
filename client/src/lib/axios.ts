import axios from "axios";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { useApiKeyModalStore } from "@/store/apiKeyModalStore";
import { SESSION_EXPIRED_EVENT } from "@/lib/sessionEvents";

// Single API base for the whole client (Frontend M3): the tutor SSE
// stream used to duplicate this fallback independently, so the two
// could drift apart. A production build without VITE_API_URL fails
// loudly here, at startup, instead of silently calling localhost
// and failing every API call with no useful message. Dev builds
// (PROD false) keep the localhost default.
const configuredApiBaseUrl = import.meta.env.VITE_API_URL as string | undefined;
if (import.meta.env.PROD && !configuredApiBaseUrl) {
  throw new Error(
    "VITE_API_URL is not set: this production build has no API base URL. " +
      "Set VITE_API_URL at build time; refusing to fall back to localhost.",
  );
}
export const API_BASE_URL = (configuredApiBaseUrl || "http://localhost:5000").replace(/\/$/, "");

// Cold-start-safe timeouts (Frontend M6): the global 30 s timeout is
// too short for a first AI call after Render idles (cold start plus
// the server's own 60 s provider timeout). AI endpoints get 180 s —
// the same budget the PDF upload already uses — while every other
// call keeps the 30 s default. The tutor SSE stream does not use this
// instance (it uses fetch with its own watchdog, slice 21), so it is
// unaffected; the legacy non-streaming /tutor/chat call is listed.
export const AI_TIMEOUT_MS = 180000;

const AI_ENDPOINTS = [
  "/tutor/chat",
  "/tutor/generate-flashcards",
  "/flashcards/generate",
  "/flashcards/generate-from-weak",
  "/flashcards/ai-suggest",
  "/quiz/generate",
  "/knowledge-graph",
  "/voice-recall/generate-questions",
  "/voice-recall/evaluate",
];

export function isAiEndpoint(url?: string): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  if (AI_ENDPOINTS.includes(path)) return true;
  // Notes AI actions carry the note id in the path.
  return (
    path.startsWith("/notes/") &&
    (path.endsWith("/summarize") || path.endsWith("/translate"))
  );
}

// One retry, GET only, for cold-start proxy failures (Render returns
// 502/503/504 while the instance wakes). POSTs are never retried here:
// a retried POST could double-create after a failure that did reach
// the app, and every AI POST already has a UI retry. A network error
// with no response is likewise not retried: it may mean the request
// was never sent, or that it was sent and the reply was lost, and
// those two cases cannot be told apart from here.
interface ColdStartRetryCandidate {
  config?: { method?: string; __m6Retried?: boolean };
  response?: { status?: number };
}

export function shouldRetryColdStart(error: ColdStartRetryCandidate): boolean {
  if (!error?.config || error.config.__m6Retried) return false;
  if (String(error.config.method || "get").toLowerCase() !== "get") return false;
  const status = error?.response?.status;
  return status !== undefined && [502, 503, 504].includes(status);
}

// Double-submit CSRF token (Backend M2 hardening, slice 46): the token
// is issued by GET /api/auth/csrf-token (cookie + JSON value) and sent
// back as X-CSRF-Token on every state-changing request. It is fetched
// lazily here, on the first mutation, so login/register/demo-login —
// which precede any session — need no prefetch step: the interceptor
// below fetches the token before the POST. Concurrent mutations share
// one in-flight fetch. A fetch failure is NOT fatal here: the request
// proceeds without a header and the response interceptor retries it
// once after a fresh token fetch (that also wakes a cold Render
// instance, which is the common reason the token fetch itself fails).
export const CSRF_HEADER_NAME = "X-CSRF-Token";
const STATE_CHANGING_METHODS = ["post", "put", "patch", "delete"];
let cachedCsrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

export function invalidateCsrfToken(): void {
  cachedCsrfToken = null;
  csrfTokenPromise = null;
}

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedCsrfToken) return cachedCsrfToken;
  if (!forceRefresh && csrfTokenPromise) return csrfTokenPromise;
  const promise = (async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`CSRF token fetch failed (${response.status})`);
    }
    const data = (await response.json()) as { csrfToken?: string };
    if (!data?.csrfToken) throw new Error("CSRF token missing from response");
    cachedCsrfToken = data.csrfToken;
    return data.csrfToken;
  })();
  csrfTokenPromise = promise;
  try {
    return await promise;
  } catch (error) {
    if (csrfTokenPromise === promise) csrfTokenPromise = null;
    throw error;
  }
}

function setCsrfHeader(
  config: { headers?: unknown },
  token: string,
): void {
  const headers = config.headers as
    | { set?: (name: string, value: string) => void }
    | Record<string, string>
    | undefined;
  if (headers && typeof headers.set === "function") {
    headers.set(CSRF_HEADER_NAME, token);
  } else {
    config.headers = {
      ...(headers as Record<string, string>),
      [CSRF_HEADER_NAME]: token,
    };
  }
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  if (isAiEndpoint(config.url)) {
    config.timeout = AI_TIMEOUT_MS;
  }
  if (STATE_CHANGING_METHODS.includes(String(config.method || "get").toLowerCase())) {
    try {
      setCsrfHeader(config, await getCsrfToken());
    } catch {
      // Proceed without a header: the response interceptor retries
      // once after a fresh token fetch if the server answers 403
      // CSRF_TOKEN_INVALID (see below). Throwing here would turn a
      // recoverable cold-start token failure into a login failure.
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    try {
      const remaining = response.headers?.["x-ratelimit-remaining"];
      const limit = response.headers?.["x-ratelimit-limit"];
      const reset = response.headers?.["x-ratelimit-reset"];

      if (remaining !== undefined && limit !== undefined) {
        useRateLimitStore.getState().setRateLimit(
          Number.parseInt(String(remaining), 10) || 0,
          Number.parseInt(String(limit), 10) || 0,
          reset ? new Date((Number.parseInt(String(reset), 10) || 0) * 1000) : null,
        );
      }
    } catch (e) {
      // ignore
    }
    return response;
  },
  async (error) => {
    // CSRF retry (slice 46): a 403 CSRF_TOKEN_INVALID means the cached
    // token is stale or was never fetched (e.g. the token fetch failed
    // on a cold start). Refetch once and retry the mutation once; a
    // second 403 is final. The request was rejected before any server
    // side effect, so retrying a POST here cannot double-create.
    if (
      error?.response?.status === 403 &&
      error.response?.data?.code === "CSRF_TOKEN_INVALID" &&
      error.config &&
      !(error.config as { __csrfRetried?: boolean }).__csrfRetried
    ) {
      (error.config as { __csrfRetried?: boolean }).__csrfRetried = true;
      try {
        setCsrfHeader(error.config, await getCsrfToken(true));
        return api(error.config);
      } catch {
        return Promise.reject(error);
      }
    }
    if (shouldRetryColdStart(error)) {
      (error.config as { __m6Retried?: boolean }).__m6Retried = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return api(error.config);
    }
    try {
      if (error.response?.status === 429) {
        const remaining = 0;
        const limit = error.response?.headers?.["x-ratelimit-limit"];
        const reset = error.response?.headers?.["x-ratelimit-reset"];

        if (limit !== undefined) {
          useRateLimitStore.getState().setRateLimit(
            remaining,
            Number.parseInt(String(limit), 10) || 0,
            reset ? new Date((Number.parseInt(String(reset), 10) || 0) * 1000) : null,
          );
        }
      }
    } catch (e) {
      // ignore
    }
    if (error?.response?.status === 402) {
      useApiKeyModalStore.getState().open(true);
    }
    // Frontend M7: never full-page-redirect on 401. A reload wipes
    // every in-memory zustand store (tutor thread, flashcard state,
    // workspace editor content), so an expired session during editing
    // destroyed unsaved work. Instead, announce the expiry: App's
    // listener clears auth state and ProtectedRoute then navigates
    // to /login through React Router with the JS heap intact. There
    // is no silent session refresh to attempt: auth is a single JWT
    // cookie with no refresh endpoint.
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

export default api;
