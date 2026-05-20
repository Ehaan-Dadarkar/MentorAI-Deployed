import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ArrowRight,
  FileQuestion,
  Layers,
  MessageSquare,
  FileText,
  Mic2,
  BookOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import api from "@/lib/axios";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────

interface Stats {
  streak: number;
  avgQuizScore: number;
  cardsMastered: number;
  totalStudyMinutes: number;
  dueCards: number;
  studyGoalMinutes: number;
  quizzesCompleted: number;
}

interface ChartPoint {
  day: string;
  date: string;
  minutes: number;
}

interface WeakTopic {
  topic: string;
  source: string;
  metric: number;
  metricLabel: string;
}

interface FocusTopic {
  subject: string;
  mastery: number;
  cardCount: number;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  subject: string;
  durationMinutes: number;
  date: string;
}

// ── Animated Counter ───────────────────────────────────

function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) => Math.round(v));
  const display = useTransform(rounded, (v) => `${v}${suffix}`);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 1,
      ease: [0.25, 0, 0, 1],
    });
    return controls.stop;
  }, [value, motionVal]);

  useEffect(() => {
    const unsub = display.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [display]);

  return <span ref={ref}>0{suffix}</span>;
}

// ── Components ──────────────────────────────────────────

const GhostButton = ({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "group relative inline-flex items-center gap-2 text-[#737373] hover:text-[#FAFAFA] uppercase tracking-[0.1em] font-semibold py-2 transition-colors duration-150 rounded-none",
      className,
    )}
  >
    <span className="whitespace-nowrap font-mono">{children}</span>
    <span className="absolute bottom-0 left-0 w-full h-[1px] bg-[#FAFAFA] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150" />
  </button>
);

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "quiz_completed":
      return <FileQuestion className="w-5 h-5" />;
    case "flashcard_session":
      return <Layers className="w-5 h-5" />;
    case "voice_recall":
      return <Mic2 className="w-5 h-5" />;
    case "tutor_chat":
      return <MessageSquare className="w-5 h-5" />;
    case "note_saved":
      return <FileText className="w-5 h-5" />;
    default:
      return <BookOpen className="w-5 h-5" />;
  }
}

function SectionSkeleton({ height = "h-48" }: { height?: string }) {
  return (
    <div
      className={`w-full ${height} bg-[#1A1A1A] animate-pulse rounded-none`}
    />
  );
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "YESTERDAY";
  return `${days}D AGO`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "MORNING";
  if (hour < 17) return "AFTERNOON";
  return "EVENING";
}

// ── Main Dashboard ─────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<ChartPoint[] | null>(null);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[] | null>(null);
  const [focusTopics, setFocusTopics] = useState<FocusTopic[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  const [statsLoading, setStatsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [weakLoading, setWeakLoading] = useState(true);
  const [focusLoading, setFocusLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    const load = async (
      url: string,
      key: string,
      setSt: (v: any) => void,
      setLoad: (v: boolean) => void,
    ) => {
      try {
        const { data } = await api.get(url);
        setSt(data[key]);
      } catch {
        // Fall back gracefully
      } finally {
        setLoad(false);
      }
    };

    load("/dashboard/stats", "stats", setStats, setStatsLoading);
    load("/dashboard/chart", "chart", setChart, setChartLoading);
    load("/dashboard/weak-topics", "weakTopics", setWeakTopics, setWeakLoading);
    load("/dashboard/focus-topics", "focusTopics", setFocusTopics, setFocusLoading);
    load("/dashboard/activity", "activity", setActivity, setActivityLoading);
  }, []);

  const greeting = getGreeting();
  const firstName = user?.name?.split(" ")[0]?.toUpperCase() || "THERE";

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.25, 0, 0, 1] as const },
    },
  };

  return (
    <div className="flex-1 overflow-auto bg-[#0A0A0A] text-[#FAFAFA] font-sans relative selection:bg-[#FF3D00] selection:text-[#0A0A0A]">
      {/* Noise Texture */}
      <div
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 max-w-[1200px] mx-auto px-4 sm:px-6 md:px-12 lg:px-16 py-8 sm:py-12 lg:py-20">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-12 sm:space-y-16 lg:space-y-20"
        >
          {/* ── HERO ── */}
          <motion.div variants={itemVariants} className="max-w-4xl">
            <h1 className="font-['Inter_Tight'] text-4xl sm:text-6xl md:text-8xl lg:text-[10rem] tracking-[-0.06em] font-medium leading-[0.85] mb-6 sm:mb-10 md:mb-12 uppercase text-[#FAFAFA] mix-blend-difference">
              {greeting},<br />
              <span className="text-[#737373]">{firstName}.</span>
            </h1>
          </motion.div>

          {/* ── METRICS ── */}
          <motion.div
            variants={itemVariants}
            className="border-t border-[#262626]"
          >
            {statsLoading ? (
              <SectionSkeleton height="h-32" />
            ) : stats ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#262626]">
                {/* Streak */}
                <div className="py-6 sm:py-8 lg:py-12 lg:pr-8 flex flex-col justify-between">
                  <p className="text-[#737373] text-xs font-mono tracking-[0.2em] uppercase mb-3 lg:mb-12">
                    Study Streak
                  </p>
                  <p className="font-['Inter_Tight'] text-4xl sm:text-5xl md:text-7xl tracking-tighter leading-none">
                    <AnimatedNumber value={stats.streak} />
                    <span className="text-xl sm:text-2xl text-[#737373] tracking-normal ml-1">
                      D
                    </span>
                  </p>
                </div>
                {/* Accuracy */}
                <div className="py-6 sm:py-8 lg:py-12 lg:px-8 flex flex-col justify-between">
                  <p className="text-[#737373] text-xs font-mono tracking-[0.2em] uppercase mb-3 lg:mb-12">
                    Accuracy
                  </p>
                  <p className="font-['Inter_Tight'] text-4xl sm:text-5xl md:text-7xl tracking-tighter leading-none text-[#FF3D00]">
                    <AnimatedNumber value={stats.avgQuizScore} />
                    <span className="text-xl sm:text-2xl text-[#737373] tracking-normal">
                      %
                    </span>
                  </p>
                </div>
                {/* Mastered */}
                <div className="py-6 sm:py-8 lg:py-12 lg:px-8 flex flex-col justify-between">
                  <p className="text-[#737373] text-xs font-mono tracking-[0.2em] uppercase mb-3 lg:mb-12">
                    Mastered
                  </p>
                  <p className="font-['Inter_Tight'] text-4xl sm:text-5xl md:text-7xl tracking-tighter leading-none">
                    <AnimatedNumber value={stats.cardsMastered} />
                  </p>
                </div>
                {/* Time */}
                <div className="py-6 sm:py-8 lg:py-12 lg:pl-8 flex flex-col justify-between">
                  <p className="text-[#737373] text-xs font-mono tracking-[0.2em] uppercase mb-3 lg:mb-12">
                    Time Invested
                  </p>
                  <p className="font-['Inter_Tight'] text-4xl sm:text-5xl md:text-7xl tracking-tighter leading-none">
                    <AnimatedNumber value={stats.totalStudyMinutes} />
                    <span className="text-xl sm:text-2xl text-[#737373] tracking-normal ml-1">
                      M
                    </span>
                  </p>
                </div>
              </div>
            ) : null}
          </motion.div>

          {/* ── CHART & GAPS ── */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 lg:gap-24"
          >
            {/* Chart */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
              <div className="border-b border-[#262626] pb-4 sm:pb-6 mb-6 sm:mb-8 flex justify-between items-end">
                <h2 className="font-['Inter_Tight'] text-2xl sm:text-4xl md:text-5xl tracking-[-0.04em] leading-none uppercase">
                  Volume
                </h2>
                <p className="text-[#737373] text-xs font-mono tracking-[0.1em]">
                  LAST 7 DAYS
                </p>
              </div>
              {/* Fixed height on mobile, flex on desktop */}
              <div className="h-[240px] sm:h-[280px] md:h-[300px] lg:flex-1 lg:min-h-[300px] w-full">
                {chartLoading ? (
                  <SectionSkeleton height="h-full" />
                ) : chart && chart.some((p) => p.minutes > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <XAxis
                        dataKey="day"
                        stroke="#737373"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        dy={16}
                        fontFamily="'JetBrains Mono', monospace"
                        className="uppercase tracking-wider"
                      />
                      <YAxis
                        stroke="#737373"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                        dx={-8}
                        fontFamily="'JetBrains Mono', monospace"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0A0A0A",
                          border: "1px solid #262626",
                          borderRadius: "0px",
                          fontSize: "12px",
                          color: "#FAFAFA",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                        itemStyle={{ color: "#FF3D00" }}
                        formatter={(value) => [`${value} MIN`, "VOLUME"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="minutes"
                        stroke="#FF3D00"
                        strokeWidth={2}
                        dot={{
                          r: 4,
                          fill: "#0A0A0A",
                          strokeWidth: 2,
                          stroke: "#FF3D00",
                        }}
                        activeDot={{
                          r: 6,
                          fill: "#FF3D00",
                          stroke: "#0A0A0A",
                          strokeWidth: 2,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center border border-[#262626] p-8 text-center text-[#737373]">
                    <span className="mb-4 text-xs font-mono tracking-[0.1em] uppercase">
                      No Activity Recorded
                    </span>
                    <GhostButton onClick={() => navigate("/tutor")}>
                      Begin Tracking
                    </GhostButton>
                  </div>
                )}
              </div>
            </div>

            {/* Knowledge Gaps */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
              <div className="border-b border-[#262626] pb-4 sm:pb-6 mb-6 sm:mb-8 flex justify-between items-end">
                <h2 className="font-['Inter_Tight'] text-2xl sm:text-4xl md:text-5xl tracking-[-0.04em] leading-none uppercase text-[#FF3D00]">
                  Gaps
                </h2>
                <p className="text-[#737373] text-xs font-mono tracking-[0.1em] uppercase">
                  Needs Review
                </p>
              </div>
              <div className="space-y-0 flex-1">
                {weakLoading ? (
                  <SectionSkeleton height="h-48" />
                ) : weakTopics && weakTopics.length > 0 ? (
                  weakTopics.slice(0, 5).map((wt, i) => (
                    <div
                      key={i}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 sm:py-5 border-b border-[#262626] last:border-none transition-colors hover:bg-[#1A1A1A] px-2 -mx-2"
                    >
                      <div className="min-w-0">
                        <p className="font-['Inter_Tight'] text-lg sm:text-xl md:text-2xl tracking-[-0.04em] leading-snug truncate mb-1">
                          {wt.topic}
                        </p>
                        <p className="text-xs font-mono uppercase text-[#FF3D00] tracking-wider">
                          {wt.metricLabel} ({wt.metric}%)
                        </p>
                      </div>
                      <GhostButton
                        onClick={() =>
                          navigate(`/tutor?topic=${encodeURIComponent(wt.topic)}`)
                        }
                        className="text-xs shrink-0 self-start sm:self-auto"
                      >
                        Improve
                      </GhostButton>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-[#737373] border-b border-[#262626]">
                    <span className="text-xs font-mono tracking-widest uppercase">
                      No weak areas identified
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── ACTIVITY & QUICK ACTIONS ── */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 lg:gap-24 pb-8 sm:pb-12 lg:pb-20"
          >
            {/* Recent Activity */}
            <div className="lg:col-span-5 xl:col-span-4">
              <div className="border-b border-[#262626] pb-4 sm:pb-6 mb-6 sm:mb-8 flex justify-between items-end">
                <h2 className="font-['Inter_Tight'] text-2xl sm:text-3xl md:text-4xl tracking-[-0.04em] leading-none uppercase">
                  Activity
                </h2>
                <p className="text-[#737373] text-xs font-mono tracking-widest uppercase">
                  Timeline
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                {activityLoading ? (
                  <SectionSkeleton height="h-64" />
                ) : activity && activity.length > 0 ? (
                  activity.slice(0, 5).map((act, i) => (
                    <div
                      key={act.id || i}
                      className="flex gap-3 sm:gap-4 group items-start"
                    >
                      <div className="w-9 h-9 sm:w-10 sm:h-10 mt-1 shrink-0 bg-[#1A1A1A] text-[#737373] group-hover:text-[#FF3D00] group-hover:bg-[#FF3D00]/10 flex items-center justify-center transition-colors">
                        <ActivityIcon type={act.type} />
                      </div>
                      <div className="flex-1 min-w-0 border-b border-[#262626] pb-4 sm:pb-6">
                        <p className="text-base sm:text-lg md:text-xl font-['Inter_Tight'] tracking-tight mb-1 sm:mb-2 text-[#FAFAFA]">
                          {act.description}
                        </p>
                        <p className="text-xs font-mono text-[#737373] uppercase tracking-[0.1em]">
                          {act.subject} • {relativeTime(act.date)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-[#737373] border-b border-[#262626]">
                    <span className="text-xs font-mono tracking-widest uppercase">
                      No recent activity
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-end">
              <div className="flex flex-col mt-auto pt-2 sm:pt-6 md:pt-12">
                {[
                  { title: "Ask AI Tutor", dest: "/tutor" },
                  { title: "Study Flashcards", dest: "/flashcards" },
                  { title: "Take Quiz", dest: "/quiz" },
                  { title: "Voice Recall", dest: "/voice-recall" },
                ].map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => navigate(action.dest)}
                    className="group flex items-center justify-between py-4 sm:py-6 md:py-8 border-b border-[#262626] text-left w-full border-t first:border-t-[#262626]"
                  >
                    <span className="font-['Inter_Tight'] text-3xl sm:text-4xl md:text-6xl lg:text-7xl tracking-[-0.06em] text-[#737373] group-hover:text-[#FF3D00] transition-colors duration-200 uppercase">
                      {action.title}
                    </span>
                    <ArrowRight
                      className="w-5 h-5 sm:w-6 sm:h-6 md:w-10 md:h-10 text-[#262626] group-hover:text-[#FF3D00] transition-all duration-200 group-hover:translate-x-2 md:group-hover:translate-x-4 shrink-0"
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}