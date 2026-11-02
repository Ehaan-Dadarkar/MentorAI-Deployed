import { create } from "zustand";
import api from "@/lib/axios";

export interface CreditPack {
  id: string;
  credits: number;
  amountCents: number;
  amount: string;
  currency: string;
  label: string;
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: unknown }).response !== null
  ) {
    const data = (error as { response: { data?: { error?: string } } }).response
      .data;
    if (data?.error) return data.error;
  }
  return fallback;
}

// In-flight balance fetch, shared so concurrent ensureBalance() calls
// (e.g. two guards firing in the same tick) issue one request.
let balanceFetchPromise: Promise<void> | null = null;

interface CreditsState {
  packs: CreditPack[];
  balance: number | null;
  /** True once the balance has been fetched at least once this session
   *  (success or failure), so guards can reuse it without refetching. */
  balanceLoaded: boolean;
  isLoading: boolean;
  buyingPackId: string | null;
  isCapturing: boolean;
  error: string | null;
  notice: string | null;
  fetchPacks: () => Promise<void>;
  /** Fetch the balance, unless already loaded this session and not forced. */
  fetchBalance: (force?: boolean) => Promise<void>;
  /** Lazy cached balance for the API-key gate: fetches once per session. */
  ensureBalance: () => Promise<number | null>;
  /** Forced refresh (after a purchase capture, PayPal return, 402, ...). */
  refreshBalance: () => Promise<void>;
  /** Mark the cached balance stale so the next ensureBalance() refetches.
   *  Called by the gate after it allows a credit-funded action, since
   *  the server spends the credits during that action. */
  invalidateBalance: () => void;
  buyPack: (packId: string) => Promise<void>;
  captureOrder: (orderId: string) => Promise<void>;
  clearNotice: () => void;
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  packs: [],
  balance: null,
  balanceLoaded: false,
  isLoading: false,
  buyingPackId: null,
  isCapturing: false,
  error: null,
  notice: null,

  fetchPacks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get("/credits/packs");
      set({ packs: data.packs ?? [], isLoading: false });
    } catch (error) {
      set({
        error: errorMessage(error, "Could not load credit packs."),
        isLoading: false,
      });
    }
  },

  fetchBalance: async (force = false) => {
    if (!force && get().balanceLoaded) return;
    if (!force && balanceFetchPromise) {
      await balanceFetchPromise;
      return;
    }
    const run = (async () => {
      try {
        const { data } = await api.get("/credits/balance");
        set({ balance: data.credits ?? null, balanceLoaded: true });
      } catch {
        // Balance stays null (e.g. demo users have no spendable balance
        // yet); the page shows the demo notice instead of an error.
        // Still marked loaded so guards do not hammer the endpoint.
        set({ balance: null, balanceLoaded: true });
      }
    })();
    balanceFetchPromise = run;
    try {
      await run;
    } finally {
      if (balanceFetchPromise === run) balanceFetchPromise = null;
    }
  },

  ensureBalance: async () => {
    await get().fetchBalance();
    return get().balance;
  },

  refreshBalance: async () => {
    await get().fetchBalance(true);
  },

  invalidateBalance: () => set({ balanceLoaded: false }),

  buyPack: async (packId) => {
    set({ buyingPackId: packId, error: null, notice: null });
    try {
      const { data } = await api.post("/credits/create-order", { packId });
      if (!data.approveUrl) {
        set({
          error: "PayPal did not return an approval link. Try again.",
          buyingPackId: null,
        });
        return;
      }
      // Full-page redirect to PayPal (sandbox). PayPal returns the
      // buyer to /credits?paypal=approved&token=<order id>.
      window.location.href = data.approveUrl;
    } catch (error) {
      set({
        error: errorMessage(error, "Could not start the PayPal checkout."),
        buyingPackId: null,
      });
    }
  },

  captureOrder: async (orderId) => {
    set({ isCapturing: true, error: null, notice: null });
    try {
      const { data } = await api.post("/credits/capture-order", { orderId });
      set({
        balance: data.credits ?? null,
        // A capture changed the balance: treat it as freshly loaded.
        balanceLoaded: true,
        isCapturing: false,
        notice: data.alreadyCaptured
          ? "This order was already captured — your balance is unchanged."
          : "Payment captured. Credits added to your balance.",
      });
    } catch (error) {
      set({
        error: errorMessage(error, "Could not capture the payment."),
        isCapturing: false,
      });
    }
  },

  clearNotice: () => set({ notice: null, error: null }),
}));
