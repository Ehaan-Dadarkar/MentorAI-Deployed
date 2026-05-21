import { useAuthStore } from "@/store/authStore";
import { useApiKeyModalStore } from "@/store/apiKeyModalStore";

export function hasBlockedOpenRouterAccess() {
  const { user } = useAuthStore.getState();
  return Boolean(user && !user.isDemo && !user.hasOpenrouterApiKey);
}

export function openApiKeyGate(force = true) {
  useApiKeyModalStore.getState().open(force);
}

export function guardOpenRouterAction(force = true) {
  if (!hasBlockedOpenRouterAccess()) {
    return false;
  }

  openApiKeyGate(force);
  return true;
}