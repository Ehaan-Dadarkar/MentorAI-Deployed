import React, { useEffect, useState } from "react";

type Props = {
  remaining?: number | null;
  limit?: number | null;
  resetTime?: Date | number | string | null; // Date, epoch seconds, or ISO
  showAddKeyPrompt?: boolean;
  onClose?: () => void;
};

export default function RateLimitBanner({
  remaining = null,
  limit = null,
  resetTime = null,
  showAddKeyPrompt = false,
  onClose,
}: Props) {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (typeof remaining !== "number") {
      setVisible(false);
      return;
    }
    // Show when low remaining or zero
    setVisible(remaining <= 3);
  }, [remaining]);

  useEffect(() => {
    if (typeof remaining !== "number") return;
    if (remaining > 3) setVisible(false);
  }, [remaining]);

  if (!visible) return null;

  const formatReset = (r: Date | number | string | null) => {
    if (!r) return null;
    try {
      const t = r instanceof Date ? r : typeof r === "number" ? new Date(r * 1000) : new Date(r);
      return t.toLocaleString();
    } catch {
      return String(r);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 py-3 bg-yellow-500 text-black flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <strong>AI Rate Limit</strong>
          <span className="text-sm">
            {remaining != null && limit != null
              ? ` ${remaining} of ${limit} remaining`
              : remaining != null
              ? ` ${remaining} remaining`
              : " Low on AI requests"}
          </span>
          {resetTime && (
            <span className="text-sm opacity-80"> • resets at {formatReset(resetTime)}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {showAddKeyPrompt && (
            <a href="/settings" className="bg-black text-white px-3 py-1 rounded text-sm">
              Add OpenRouter API Key →
            </a>
          )}
          <button
            onClick={() => {
              setVisible(false);
              onClose?.();
            }}
            className="text-sm opacity-80"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
