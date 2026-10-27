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

interface CreditsState {
  packs: CreditPack[];
  balance: number | null;
  isLoading: boolean;
  buyingPackId: string | null;
  isCapturing: boolean;
  error: string | null;
  notice: string | null;
  fetchPacks: () => Promise<void>;
  fetchBalance: () => Promise<void>;
  buyPack: (packId: string) => Promise<void>;
  captureOrder: (orderId: string) => Promise<void>;
  clearNotice: () => void;
}

export const useCreditsStore = create<CreditsState>((set) => ({
  packs: [],
  balance: null,
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

  fetchBalance: async () => {
    try {
      const { data } = await api.get("/credits/balance");
      set({ balance: data.credits ?? null });
    } catch {
      // Balance stays null (e.g. demo users have no spendable balance
      // yet); the page shows the demo notice instead of an error.
      set({ balance: null });
    }
  },

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
