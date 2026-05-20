import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";

export default function ApiKeySettings() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { checkAuth } = useAuthStore();

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get("/settings/api-key");
      setHasApiKey(Boolean(data.hasApiKey));
      setMaskedKey(data.maskedKey || null);
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to load key status");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSave = async () => {
    if (!apiKeyInput || typeof apiKeyInput !== "string") return;
    setIsSaving(true);
    setMessage(null);
    try {
      await api.post("/settings/api-key", { apiKey: apiKeyInput.trim() });
      setMessage("API key saved successfully");
      setApiKeyInput("");
      await fetchStatus();
      await checkAuth();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to save key");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await api.delete("/settings/api-key");
      setMessage("API key removed");
      await fetchStatus();
      await checkAuth();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to remove key");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">OpenRouter API Key</h3>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <p className="text-sm text-gray-400">
            {hasApiKey ? (
              <>
                Using your personal key <span className="ml-2 font-mono">{maskedKey}</span>
              </>
            ) : (
              <>Using default key (limited). Add your own to remove limits.</>
            )}
          </p>

          <div className="flex gap-2 items-center">
            <input
              type="password"
              placeholder={hasApiKey ? "Enter new key to replace saved key" : "Paste your OpenRouter API key"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="flex-1 bg-transparent border border-gray-700 px-3 py-2 rounded"
            />
            <button
              onClick={handleSave}
              disabled={isSaving || !apiKeyInput.trim()}
              className="px-4 py-2 bg-amber-500 text-black font-bold rounded disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            {hasApiKey && (
              <button
                onClick={handleRemove}
                disabled={isSaving}
                className="px-3 py-2 bg-red-600 text-white rounded disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {message && <p className="mt-2 text-sm">{message}</p>}

          <p className="text-xs text-gray-500 mt-2">
            Get a free key at <a className="underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>
          </p>
        </>
      )}
    </div>
  );
}
