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
      className={cn(
        "flex-1 overflow-auto",
        // Mobile: top bar (56px) + bottom nav (64px) padding
        "pt-14 pb-20",
        // Tablet: left sidebar (64px) + top padding only
        "md:pt-0 md:pb-0 md:ml-16",
        // Desktop: left sidebar (240px or 64px - handled by flex layout)
        "lg:ml-0",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}