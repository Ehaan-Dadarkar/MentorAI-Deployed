import axios from "axios";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { useApiKeyModalStore } from "@/store/apiKeyModalStore";

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

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (isAiEndpoint(config.url)) {
    config.timeout = AI_TIMEOUT_MS;
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
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
