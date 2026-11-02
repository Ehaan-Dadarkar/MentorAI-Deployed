import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useAuthStore } from "@/store/authStore";
import { useCreditsStore } from "@/store/creditsStore";
import { cn } from "@/lib/utils";
import api from "@/lib/axios";

interface PendingPurchase {
  id: string;
  paypalOrderId: string;
  packId: string;
  credits: number;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
}

export default function Credits() {
  const { user } = useAuthStore();
  const {
    packs,
    balance,
    isLoading,
    buyingPackId,
    isCapturing,
    error,
    notice,
    fetchPacks,
    fetchBalance,
    buyPack,
    captureOrder,
  } = useCreditsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cancelledNotice, setCancelledNotice] = useState<string | null>(null);
  const [pendingPurchases, setPendingPurchases] = useState<PendingPurchase[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
  // Guard the approval return so a double-invoked effect (React
  // StrictMode in dev) or a refresh never captures twice. The server
  // is idempotent too; this is the client-side belt to its braces.
  const handledReturn = useRef(false);

  // H2: purchases whose capture never completed stay `pending` on the
  // server. List them so the user has a self-service retry path
  // instead of a stranded payment.
  const fetchPending = async () => {
    try {
      const { data } = await api.get("/credits/purchases");
      const all = (data.purchases || []) as PendingPurchase[];
      setPendingPurchases(all.filter((p) => p.status === "pending"));
      setPendingError(null);
    } catch {
      setPendingError("Could not load pending purchases.");
    }
  };

  const handleRetryCapture = async (orderId: string) => {
    setRetryingOrderId(orderId);
    try {
      // Server-side capture is idempotent (already-captured orders
      // answer with the balance, never crediting twice).
      await captureOrder(orderId);
    } finally {
      setRetryingOrderId(null);
      await fetchPending();
    }
  };

  useEffect(() => {
    fetchPacks();
    fetchBalance(true);
    void fetchPending();
    if (handledReturn.current) return;
    handledReturn.current = true;
    const outcome = searchParams.get("paypal");
    if (outcome === "approved") {
      const token = searchParams.get("token");
      if (token) {
        // H2: only drop the token from the URL once the capture
        // actually succeeds. A failed capture keeps
        // ?paypal=approved&token= so a refresh retries instead of
        // stranding the payment; the row also stays in the pending
        // list below with its own retry button.
        void (async () => {
          await captureOrder(token);
          const { error: captureError } = useCreditsStore.getState();
          if (!captureError) {
            setSearchParams({}, { replace: true });
          }
          await fetchPending();
        })();
      } else {
        setSearchParams({}, { replace: true });
      }
    } else if (outcome === "cancelled") {
      setCancelledNotice("Checkout cancelled — no payment was taken.");
      setSearchParams({}, { replace: true });
    }
    // Run once on mount: the return params are only meaningful here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDemo = Boolean(user?.isDemo);

  return (
    <PageWrapper>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-black tracking-tight text-[#FAFAFA]">
          Credits
        </h1>
        <p className="mt-2 text-sm text-[#8a8a8a]">
          PayPal sandbox only — no real money moves. Buy a pack, approve it
          on PayPal, and you return here for the capture.
        </p>

        <div className="mt-6 border border-[#262626] px-5 py-4 flex items-center justify-between">
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#8a8a8a]">
            Your balance
          </span>
          <span className="text-xl font-black text-[#FAFAFA]">
            {balance === null ? "—" : `${balance} credits`}
          </span>
        </div>

        {isDemo && (
          <p className="mt-4 border border-[#262626] px-5 py-4 text-sm text-[#FAFAFA]">
            Demo accounts cannot buy credits. Sign up for a full account to
            purchase.
          </p>
        )}

        <p className="mt-4 border border-[#262626] px-5 py-4 text-sm text-[#8a8a8a]">
          How credits work: if you have your own OpenRouter key, AI
          calls use it and never touch your balance. If you do not,
          each AI request spends 1 credit and runs on the shared key
          instead — that flat 1-credit-per-request price is the
          confirmed rate. A request that
          fails before delivering an AI result gives its credit
          back; the live tutor stream is the exception, since a
          stream that dies mid-answer already delivered part of an
          answer. Demo accounts cannot buy credits and are never
          charged.
        </p>

        {(notice || cancelledNotice) && (
          <p className="mt-4 border border-[#262626] px-5 py-4 text-sm text-[#FAFAFA]">
            {notice ?? cancelledNotice}
          </p>
        )}
        {error && (
          <p className="mt-4 border border-[#FF3D00] px-5 py-4 text-sm text-[#FAFAFA]">
            {error}
          </p>
        )}
        {isCapturing && (
          <p className="mt-4 text-sm text-[#8a8a8a]">
            Capturing your payment…
          </p>
        )}

        {pendingPurchases.length > 0 && (
          <div className="mt-8 border border-[#FF3D00] px-5 py-5">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#FF3D00]">
              Pending purchases
            </p>
            <p className="mt-2 text-sm text-[#8a8a8a]">
              These payments were approved on PayPal but the capture did
              not complete — no credits were added yet. Retry the capture
              to finish; you will not be charged again.
            </p>
            {pendingError && (
              <p className="mt-2 text-sm text-[#FAFAFA]">{pendingError}</p>
            )}
            <div className="mt-4 space-y-3">
              {pendingPurchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="border border-[#262626] px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-bold text-[#FAFAFA]">
                      {purchase.credits} credits — ${purchase.amount}{" "}
                      {purchase.currency}
                    </p>
                    <p className="text-xs text-[#8a8a8a]">
                      {purchase.packId} ·{" "}
                      {new Date(purchase.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleRetryCapture(purchase.paypalOrderId)}
                    disabled={isCapturing || retryingOrderId !== null}
                    className={cn(
                      "border border-[#FAFAFA] px-4 py-2",
                      "text-xs font-bold tracking-[0.2em] uppercase text-[#FAFAFA]",
                      "hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors cursor-pointer",
                      "disabled:opacity-50 disabled:pointer-events-none",
                    )}
                  >
                    {retryingOrderId === purchase.paypalOrderId
                      ? "Retrying…"
                      : "Retry capture"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {isLoading && packs.length === 0 && (
            <p className="text-sm text-[#8a8a8a]">Loading packs…</p>
          )}
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="border border-[#262626] px-5 py-5 flex flex-col gap-3"
            >
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#8a8a8a]">
                {pack.label}
              </span>
              <span className="text-2xl font-black text-[#FAFAFA]">
                {pack.credits} credits
              </span>
              <span className="text-sm text-[#8a8a8a]">
                ${pack.amount} USD
              </span>
              <button
                onClick={() => buyPack(pack.id)}
                disabled={isDemo || buyingPackId !== null || isCapturing}
                className={cn(
                  "mt-auto border border-[#FAFAFA] px-4 py-3",
                  "text-xs font-bold tracking-[0.2em] uppercase text-[#FAFAFA]",
                  "hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors cursor-pointer",
                  "disabled:opacity-50 disabled:pointer-events-none",
                )}
              >
                {buyingPackId === pack.id ? "Redirecting…" : "Buy with PayPal"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
