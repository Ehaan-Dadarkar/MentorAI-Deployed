import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Trophy, Star, ArrowLeft, BookOpen, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useFlashcardStore } from "@/store/flashcardStore";
import { cn } from "@/lib/utils";

// ── UI Primitives ───────────────────────────────────────────

const PrimaryButton = ({
  children,
  onClick,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <motion.button
    whileHover="hover"
    initial="initial"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden bg-transparent",
      // ↓ responsive padding
      "px-4 sm:px-6 py-3 sm:py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase disabled:opacity-50",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-0.5 bg-[#FF3D00]"
    />
    <motion.div
      variants={{ initial: { scaleX: 1, originX: 1 }, hover: { scaleX: 0, originX: 1 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#262626]"
    />
  </motion.button>
);

const GhostButton = ({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <motion.button
    whileHover="hover"
    initial="initial"
    onClick={onClick}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden bg-transparent px-4 py-3 text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] transition-colors",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#FAFAFA]"
    />
  </motion.button>
);

// ── Shared Animation Config ─────────────────────────────────

const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

// ── Helpers ─────────────────────────────────────────────────

function addDays(input: Date, days: number) {
  const d = new Date(input);
  d.setDate(d.getDate() + days);
  return d;
}

function keyForDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function activityClass(count: number) {
  if (count === 0) return "bg-[#0A0A0A] border-[#262626]";
  if (count <= 4) return "bg-[#FF3D00]/20 border-[#FF3D00]/30";
  if (count <= 10) return "bg-[#FF3D00]/50 border-[#FF3D00]/60";
  return "bg-[#FF3D00] border-[#FF3D00]";
}

// ── Main Page ───────────────────────────────────────────────

export default function FlashcardStats() {
  const navigate = useNavigate();
  const { stats, isFetchingStats, fetchStats } = useFlashcardStore();

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const heatmap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of stats?.heatmapData || []) {
      map.set(entry.date, entry.count);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = addDays(today, -364);
    const startWeekAnchor = addDays(start, -start.getDay());
    const weeks: Array<Array<{ date: Date; count: number }>> = [];
    const monthLabels: Array<{ label: string; weekIndex: number }> = [];

    for (let week = 0; week < 53; week += 1) {
      const column: Array<{ date: Date; count: number }> = [];
      for (let day = 0; day < 7; day += 1) {
        const current = addDays(startWeekAnchor, week * 7 + day);
        const key = keyForDate(current);
        column.push({ date: current, count: map.get(key) || 0 });
      }
      weeks.push(column);

      const first = column.find((cell) => cell.date.getDate() <= 7);
      if (first && first.date.getDay() === 0) {
        const label = first.date.toLocaleString("default", { month: "short" });
        if (!monthLabels.some((m) => m.label === label && m.weekIndex === week)) {
          monthLabels.push({ label, weekIndex: week });
        }
      }
    }

    return { weeks, monthLabels };
  }, [stats?.heatmapData]);

  return (
    <PageWrapper>
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-8 sm:pb-16 md:pb-32 font-sans">

        {/* NOISE TEXTURE */}
        {/* ↓ z-30 keeps it below modals/popovers */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        {/* ── HERO SECTION ── */}
        {/* ↓ responsive top/bottom padding and horizontal gutter */}
        <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            // ↓ stacks on mobile, side-by-side from md
            className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-12"
          >
            <div>
              {/* ↓ hero heading starts at text-4xl on mobile */}
              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-6xl md:text-8xl lg:text-[8rem] font-bold tracking-tighter leading-none"
              >
                MNEMOSYNE
                <br />
                <span className="text-[#FF3D00]">STATISTICS.</span>
              </motion.h1>
              <motion.div
                variants={fadeUp}
                className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6"
              >
                <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  COGNITIVE RETENTION METRICS
                </p>
              </motion.div>
            </div>

            <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:min-w-48">
              <GhostButton onClick={() => navigate("/flashcards")} className="px-0">
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">RETURN TO DECKS</span>
                <span className="sm:hidden">BACK</span>
              </GhostButton>
            </motion.div>
          </motion.div>
        </div>

        {/* ── METRICS GRID ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-8 sm:py-12 md:py-16">
          {/* ↓ single col mobile → 3-col from sm */}
          <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-l border-[#262626] mb-8 sm:mb-12 md:mb-16">

            {/* Current Streak */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.6, ease: easing }}
              // ↓ responsive padding, reduced min-h on mobile
              className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 flex flex-col justify-between min-h-40 sm:min-h-60"
            >
              <div className="flex justify-between items-start mb-auto">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                  ACTIVE
                </span>
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-[#737373]" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] mb-2 uppercase">
                  CURRENT STREAK
                </p>
                {/* ↓ number scales from text-4xl */}
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">
                  {stats?.currentStreak || 0}
                  <span className="text-lg sm:text-2xl text-[#737373] ml-2 tracking-normal">DAYS</span>
                </p>
              </div>
            </motion.div>

            {/* Longest Streak */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6, ease: easing }}
              className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 flex flex-col justify-between min-h-40 sm:min-h-60 bg-[#0A0A0A]"
            >
              <div className="flex justify-between items-start mb-auto">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                  MAXIMUM
                </span>
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-[#737373]" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] mb-2 uppercase">
                  LONGEST STREAK
                </p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">
                  {stats?.longestStreak || 0}
                  <span className="text-lg sm:text-2xl text-[#737373] ml-2 tracking-normal">DAYS</span>
                </p>
              </div>
            </motion.div>

            {/* Cards Mastered */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6, ease: easing }}
              className="border-b border-r border-[#262626] p-5 sm:p-8 md:p-12 flex flex-col justify-between min-h-40 sm:min-h-60"
            >
              <div className="flex justify-between items-start mb-auto">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                  ACHIEVEMENT
                </span>
                <Star className="w-4 h-4 sm:w-5 sm:h-5 text-[#737373]" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] mb-2 uppercase">
                  CARDS MASTERED
                </p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-[#FAFAFA]">
                  {stats?.milestones.totalMastered || 0}
                  <span className="text-lg sm:text-2xl text-[#737373] ml-2 tracking-normal">TOTAL</span>
                </p>
              </div>
            </motion.div>
          </div>

          {/* ── HEATMAP ── */}
          <div className="mb-8 sm:mb-12 md:mb-16">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              {/* ↓ heading scales from text-xl */}
              <h2 className="text-xl sm:text-2xl font-bold tracking-tighter uppercase">
                ACTIVITY MATRIX
              </h2>
              <div className="h-px flex-1 bg-[#262626]" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                365 DAY SPAN
              </span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: easing }}
              // ↓ tighter padding on mobile; overflow-x-auto handles the min-w grid
              className="border border-[#262626] p-4 sm:p-8 overflow-x-auto"
            >
              {/* ↓ min-w stays fixed — grid cell px are absolute, scrolls on small screens */}
              <div className="min-w-[860px]">
                {/* Month labels */}
                <div className="relative h-6 mb-4">
                  {heatmap.monthLabels.map((month) => (
                    <span
                      key={`${month.label}-${month.weekIndex}`}
                      className="absolute text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase"
                      style={{ left: `${month.weekIndex * 16}px` }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>

                {/* Grid */}
                {isFetchingStats ? (
                  <div className="h-[140px] bg-[#0A0A0A] border border-[#262626] animate-pulse" />
                ) : (
                  <div
                    className="grid grid-rows-7 gap-[3px]"
                    style={{ gridTemplateColumns: "repeat(53, minmax(0, 1fr))" }}
                  >
                    {Array.from({ length: 7 }).map((_, dayIndex) =>
                      heatmap.weeks.map((week, weekIndex) => {
                        const cell = week[dayIndex];
                        return (
                          <motion.div
                            key={`${weekIndex}-${dayIndex}`}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              delay: (weekIndex + dayIndex) * 0.002 + 0.5,
                              duration: 0.3,
                              ease: easing,
                            }}
                            title={`${cell.date.toLocaleDateString()}: ${cell.count} CARDS`}
                            className={`w-[13px] h-[13px] border ${activityClass(cell.count)} transition-all duration-300 hover:scale-125 hover:z-10`}
                          />
                        );
                      }),
                    )}
                  </div>
                )}

                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-6">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                    NEGLIGIBLE
                  </span>
                  <div className="w-[13px] h-[13px] bg-[#0A0A0A] border border-[#262626]" />
                  <div className="w-[13px] h-[13px] bg-[#FF3D00]/20 border border-[#FF3D00]/30" />
                  <div className="w-[13px] h-[13px] bg-[#FF3D00]/50 border border-[#FF3D00]/60" />
                  <div className="w-[13px] h-[13px] bg-[#FF3D00] border border-[#FF3D00]" />
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                    PROLIFIC
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── BOTTOM MILESTONES ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: easing }}
            // ↓ single col mobile → 2-col from sm
            className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-[#262626]"
          >
            {/* Total Reviewed */}
            <div className="border-b border-r border-[#262626] p-5 sm:p-8 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-2">
                  TOTAL CARDS REVIEWED
                </p>
                {/* ↓ number scales from text-3xl */}
                <p className="text-3xl sm:text-4xl font-bold tracking-tighter text-[#FAFAFA] mt-1">
                  {stats?.milestones.totalReviewed || 0}
                </p>
              </div>
              {/* ↓ icon scales from sm */}
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-[#262626] shrink-0" />
            </div>

            {/* Total Decks */}
            <div className="border-b border-r border-[#262626] p-5 sm:p-8 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-2">
                  TOTAL DECKS CREATED
                </p>
                <p className="text-3xl sm:text-4xl font-bold tracking-tighter text-[#FAFAFA] mt-1">
                  {stats?.milestones.totalDecks || 0}
                </p>
              </div>
              <Layers className="w-6 h-6 sm:w-8 sm:h-8 text-[#262626] shrink-0" />
            </div>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
}