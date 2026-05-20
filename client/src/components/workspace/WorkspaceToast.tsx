import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceToastProps {
  message: string;
  tone: "success" | "error";
  onClose: () => void;
}

const easing = [0.25, 0, 0, 1] as const;

export function WorkspaceToast({ message, tone, onClose }: WorkspaceToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timeout);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, x: 0 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: -20, x: 0 }}
        transition={{ duration: 0.3, ease: easing }}
        className={cn(
          "fixed top-6 right-6 z-50 border px-4 py-3 bg-[#0A0A0A]",
          tone === "success"
            ? "border-[#FAFAFA]"
            : "border-[#FF3D00]",
        )}
        role="status"
        aria-live="polite"
      >
        {/* Noise texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay z-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          {tone === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-[#FAFAFA] shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-[#FF3D00] shrink-0" />
          )}
          <p className={cn(
            "text-[10px] font-bold tracking-widest uppercase",
            tone === "success" ? "text-[#FAFAFA]" : "text-[#FF3D00]"
          )}>
            {message}
          </p>
          <button
            type="button"
            className="ml-2 p-1 text-[#737373] hover:text-[#FAFAFA] transition-colors"
            onClick={onClose}
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Auto-close progress bar */}
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 4, ease: "linear" }}
          className={cn(
            "absolute bottom-0 left-0 right-0 h-[2px] origin-left",
            tone === "success" ? "bg-[#FAFAFA]" : "bg-[#FF3D00]"
          )}
        />
      </motion.div>
    </AnimatePresence>
  );
}