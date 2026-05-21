import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useApiKeyModalStore } from "@/store/apiKeyModalStore";

interface ApiKeyGateModalProps {
  ignoreSessionStorage?: boolean;
}

export default function ApiKeyGateModal({
  ignoreSessionStorage,
}: ApiKeyGateModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { isOpen, ignoreSessionStorage: storeIgnoreSessionStorage, close } =
    useApiKeyModalStore();
  const [isDismissed, setIsDismissed] = useState(() =>
    sessionStorage.getItem("apikey-modal-dismissed") === "true",
  );

  const shouldIgnoreSessionStorage =
    ignoreSessionStorage ?? storeIgnoreSessionStorage;

  if (
    !isOpen ||
    !user ||
    user.isDemo ||
    user.hasOpenrouterApiKey ||
    location.pathname === "/settings" ||
    (!shouldIgnoreSessionStorage && isDismissed)
  ) {
    return null;
  }

  const dismissForSession = () => {
    sessionStorage.setItem("apikey-modal-dismissed", "true");
    setIsDismissed(true);
    close();
  };

  const handleNavigateToSettings = () => {
    close();
    navigate("/settings");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A]/95 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,61,0,0.08),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
      <div className="relative w-full max-w-xl border border-[#262626] bg-[#0A0A0A] px-5 py-6 shadow-[0_0_0_1px_rgba(255,61,0,0.08)] sm:px-8 sm:py-8">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tighter leading-none uppercase text-[#FAFAFA] sm:text-5xl">
            ACTION REQUIRED
          </h2>
          <div className="max-w-lg space-y-4 text-[11px] font-bold leading-6 tracking-[0.16em] text-[#737373] uppercase sm:text-sm">
            <p>
              AI FEATURES ARE DISABLED UNTIL YOU ADD YOUR OPENROUTER API KEY.
              THIS INCLUDES THE AI TUTOR, FLASHCARD GENERATION, QUIZ GENERATION,
              NOTE SUMMARIZATION, VOICE RECALL, AND KNOWLEDGE GRAPH.
            </p>
            <p>
              GET A FREE KEY AT{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[#FF3D00] underline underline-offset-4"
              >
                OPENROUTER.AI/KEYS
              </a>
              {" "}
              — IT TAKES 30 SECONDS.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button
            type="button"
            onClick={handleNavigateToSettings}
            className="inline-flex items-center justify-center border border-[#FF3D00] bg-transparent px-5 py-3 text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase transition-colors hover:bg-[#FF3D00]/10"
          >
            SET API KEY
          </button>
          <button
            type="button"
            onClick={dismissForSession}
            className="inline-flex items-center justify-center px-1 py-3 text-xs font-bold tracking-[0.2em] text-[#737373] uppercase transition-colors hover:text-[#FAFAFA] self-start"
          >
            I&apos;LL DO IT LATER
          </button>
        </div>
      </div>
    </div>
  );
}