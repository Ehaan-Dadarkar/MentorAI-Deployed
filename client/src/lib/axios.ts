import axios from "axios";
import { useRateLimitStore } from "@/store/rateLimitStore";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
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
  (error) => {
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
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
