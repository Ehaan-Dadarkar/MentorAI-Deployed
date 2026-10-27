import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useAuthStore } from "@/store/authStore";
import { useCreditsStore } from "@/store/creditsStore";
import { cn } from "@/lib/utils";

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
  // Guard the approval return so a double-invoked effect (React
  // StrictMode in dev) or a refresh never captures twice. The server
  // is idempotent too; this is the client-side belt to its braces.
  const handledReturn = useRef(false);

  useEffect(() => {
    fetchPacks();
    fetchBalance();
    if (handledReturn.current) return;
    handledReturn.current = true;
    const outcome = searchParams.get("paypal");
    if (outcome === "approved") {
      const token = searchParams.get("token");
      if (token) {
        captureOrder(token);
      }
      // Drop the token from the URL so a refresh cannot re-trigger.
      setSearchParams({}, { replace: true });
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
        <p className="mt-2 text-sm text-[#737373]">
          PayPal sandbox only — no real money moves. Buy a pack, approve it
          on PayPal, and you return here for the capture.
        </p>

        <div className="mt-6 border border-[#262626] px-5 py-4 flex items-center justify-between">
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#737373]">
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

        <p className="mt-4 border border-[#262626] px-5 py-4 text-sm text-[#737373]">
          How credits work: if you have your own OpenRouter key, AI
          calls use it and never touch your balance. If you do not,
          each AI request spends 1 credit and runs on the shared key
          instead — that 1-credit price is a placeholder while the
          final price is decided, not a final rate. Demo accounts
          cannot buy credits and are never charged.
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
          <p className="mt-4 text-sm text-[#737373]">
            Capturing your payment…
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {isLoading && packs.length === 0 && (
            <p className="text-sm text-[#737373]">Loading packs…</p>
          )}
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="border border-[#262626] px-5 py-5 flex flex-col gap-3"
            >
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#737373]">
                {pack.label}
              </span>
              <span className="text-2xl font-black text-[#FAFAFA]">
                {pack.credits} credits
              </span>
              <span className="text-sm text-[#737373]">
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
