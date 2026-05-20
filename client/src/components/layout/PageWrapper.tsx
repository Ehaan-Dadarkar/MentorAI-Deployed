import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

const easing = [0.25, 0, 0, 1] as const;

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: easing }}
      className={cn("flex-1 overflow-auto", className)}
    >
      {children}
    </motion.div>
  );
}