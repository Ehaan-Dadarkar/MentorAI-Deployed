import { useAuthStore } from "@/store/authStore";
import { useApiKeyModalStore } from "@/store/apiKeyModalStore";
import { useCreditsStore } from "@/store/creditsStore";

export function hasBlockedOpenRouterAccess() {
  const { user } = useAuthStore.getState();
  return Boolean(user && !user.isDemo && !user.hasOpenrouterApiKey);
}

export function openApiKeyGate(force = true) {
  useApiKeyModalStore.getState().open(force);
}

// Credit-aware block check (C1). True when the action must be blocked:
//   - signed out, demo, or key holder: same answer as
//     hasBlockedOpenRouterAccess() — demo users are never gated here
//     (the server serves them the shared key, uncharged; the credit
//     path is not consulted for them since they cannot buy credits),
//     and key holders are never blocked;
//   - keyless non-demo user: blocked only when the cached credit
//     balance covers no AI call. The balance is fetched lazily once
//     per session (credits store caches it) and invalidated after
//     each credit-funded allow, since the server spends the credits
//     during that action. The server remains authoritative: it 402s
//     when the balance is actually insufficient, and the axios 402
//     handler reopens the gate.
export async function isOpenRouterActionBlocked(): Promise<boolean> {
  const { user } = useAuthStore.getState();
  if (!user || user.isDemo || user.hasOpenrouterApiKey) {
    return false;
  }
  const balance = await useCreditsStore.getState().ensureBalance();
  if (typeof balance === "number" && balance >= 1) {
    useCreditsStore.getState().invalidateBalance();
    return false;
  }
  return true;
}

export async function guardOpenRouterAction(force = true): Promise<boolean> {
  if (!(await isOpenRouterActionBlocked())) {
    return false;
  }

  openApiKeyGate(force);
  return true;
}
