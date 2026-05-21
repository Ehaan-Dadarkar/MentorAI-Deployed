import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import api from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

export interface ApiKeySettingsRef {
  save: () => Promise<void>;
}

const ApiKeySettings = forwardRef<ApiKeySettingsRef>((_, ref) => {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { user, checkAuth } = useAuthStore();
  const isDemo = Boolean(user?.isDemo);

  const fetchStatus = async () => {
    if (isDemo) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.get("/settings/api-key");
      setHasApiKey(Boolean(data.hasApiKey));
      setMaskedKey(data.maskedKey || null);
    } catch (err: any) {
      setMessage({
        text: err?.response?.data?.error || "Failed to load key status",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [isDemo]);

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (isDemo) return;

        // Nothing typed — skip silently, nothing to save
        if (!apiKeyInput.trim()) return;

        // ✅ Client-side format check mirrors the backend validation
        // so the user gets instant feedback before a request is even made
        if (!apiKeyInput.trim().startsWith("sk-or-")) {
          setMessage({
            text: "INVALID KEY FORMAT — KEY MUST START WITH sk-or-",
            type: "error",
          });
          throw new Error("Invalid key format");
        }

        try {
          await api.post("/settings/api-key", { apiKey: apiKeyInput.trim() });
          // ✅ Show success message inside the component
          setMessage({ text: "API KEY SAVED SUCCESSFULLY", type: "success" });
          setApiKeyInput("");
          await fetchStatus();
          await checkAuth();
        } catch (err: any) {
          // ✅ Surface the actual backend error message so the user can see it
          const errMsg =
            err?.response?.data?.error || "FAILED TO SAVE KEY — CHECK YOUR KEY AND TRY AGAIN";
          setMessage({ text: errMsg, type: "error" });
          throw new Error(errMsg);
        }
      },
    }),
    [apiKeyInput, checkAuth, isDemo],
  );

  const handleRemove = async () => {
    if (isDemo) return;

    setIsRemoving(true);
    setMessage(null);
    try {
      await api.delete("/settings/api-key");
      setMessage({ text: "API KEY REMOVED", type: "success" });
      await fetchStatus();
      await checkAuth();
    } catch (err: any) {
      setMessage({
        text: err?.response?.data?.error || "FAILED TO REMOVE KEY",
        type: "error",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-4 mb-8 sm:mb-12">
        <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">
          API KEY
        </h2>
        <div className="h-px flex-1 bg-[#262626]" />
        <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase hidden sm:block">
          02 ITEMS
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="h-12 w-full border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
          <div className="h-12 w-2/3 border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
        </div>
      ) : isDemo ? (
        <div className="border border-[#262626] bg-[#0A0A0A] px-4 py-4 text-[10px] font-bold tracking-[0.16em] text-[#FAFAFA] uppercase leading-6">
          DEMO ACCOUNT USES A SHARED KEY — REGISTER A FREE ACCOUNT TO USE YOUR OWN KEY
        </div>
      ) : (
        <div className="space-y-8">
          {/* Status indicator */}
          <div>
            <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
              CURRENT STATUS
            </label>
            <div className="flex items-center gap-3 py-2 border-b border-[#262626]">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  hasApiKey ? "bg-[#FF3D00]" : "bg-[#737373]",
                )}
              />
              {hasApiKey ? (
                <span className="text-sm font-bold tracking-widest text-[#FAFAFA] uppercase font-mono">
                  {maskedKey}
                </span>
              ) : (
                <span className="text-sm font-bold tracking-widest text-[#737373] uppercase">
                  NO PERSONAL KEY — USING SHARED FALLBACK
                </span>
              )}
            </div>
          </div>

          {/* Note — only shown when a key is already saved */}
          {hasApiKey && (
            <div className="flex items-start gap-3 border border-[#FF3D00]/30 bg-[#FF3D00]/5 px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FF3D00] shrink-0 mt-1.25" />
              <p className="text-[10px] font-bold tracking-[0.16em] leading-5 text-[#FF3D00] uppercase">
                YOU ALREADY HAVE AN API KEY SAVED — LEAVE THE FIELD BELOW EMPTY IF YOU
                DON'T WANT TO REPLACE IT.
              </p>
            </div>
          )}

          {/* Key input */}
          <div>
            <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
              {hasApiKey ? "REPLACE KEY" : "ADD OPENROUTER KEY"}
            </label>
            <input
              type="password"
              placeholder={
                hasApiKey
                  ? "ENTER NEW KEY TO REPLACE..."
                  : "PASTE YOUR OPENROUTER KEY..."
              }
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                if (message) setMessage(null);
              }}
              className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors"
            />
            <p className="mt-3 text-[10px] leading-5 tracking-[0.16em] text-[#737373] uppercase">
              GET A FREE KEY AT{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[#FF3D00] transition-colors underline underline-offset-4"
              >
                OPENROUTER.AI/KEYS
              </a>
            </p>
          </div>

          {/* Remove — only shown when a key exists */}
          {hasApiKey && (
            <div>
              <button
                onClick={handleRemove}
                disabled={isRemoving}
                className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase hover:text-[#FF3D00] transition-colors disabled:opacity-40 disabled:pointer-events-none border-b border-transparent hover:border-[#FF3D00] pb-0.5"
              >
                {isRemoving ? "REMOVING..." : "REMOVE KEY"}
              </button>
            </div>
          )}

          {/* Feedback message */}
          {message && (
            <p
              className={cn(
                "text-[10px] font-bold tracking-[0.2em] uppercase",
                message.type === "success" ? "text-[#FAFAFA]" : "text-[#FF3D00]",
              )}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
});

ApiKeySettings.displayName = "ApiKeySettings";
export default ApiKeySettings;