import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const easing = [0.25, 0, 0, 1] as const;

export function PrimaryButton({
  children,
  onClick,
  className,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <motion.button
      whileHover="hover"
      whileTap="tap"
      initial="initial"
      onClick={onClick}
      disabled={disabled}
      type={type}
      className={cn(
        "group relative inline-flex items-center gap-2 overflow-hidden",
        "bg-transparent px-4 sm:px-6 py-3 sm:py-4",
        "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
        "disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        className,
      )}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      <motion.div
        variants={{
          initial: { scaleX: 0, originX: 0 },
          hover: { scaleX: 1, originX: 0 },
          tap: { scaleX: 1, originX: 0 },
        }}
        transition={{ duration: 0.15, ease: easing }}
        className="absolute inset-x-0 bottom-0 h-0.5 bg-[#FF3D00]"
      />
      <motion.div
        variants={{
          initial: { scaleX: 1, originX: 1 },
          hover: { scaleX: 0, originX: 1 },
          tap: { scaleX: 0, originX: 1 },
        }}
        transition={{ duration: 0.15 }}
        className="absolute inset-x-0 bottom-0 h-px bg-[#262626]"
      />
    </motion.button>
  );
}