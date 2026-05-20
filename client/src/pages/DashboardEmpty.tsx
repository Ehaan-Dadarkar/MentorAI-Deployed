import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Mic2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Components ──────────────────────────────────────────

const PrimaryButton = ({
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
      "group relative inline-flex items-center gap-2 text-[#FF3D00] uppercase tracking-widest font-semibold py-3 transition-transform duration-150 active:translate-y-px",
      className
    )}
  >
    <span className="whitespace-nowrap">{children}</span>
    <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#FF3D00] origin-left scale-x-100 group-hover:scale-x-110 transition-transform duration-150" />
  </button>
);

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "MORNING";
  if (hour < 17) return "AFTERNOON";
  return "EVENING";
}

// ── Main Dashboard Empty State ─────────────────────────────────────

export default function DashboardEmpty() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
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
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0, 0, 1] as const } },
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

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-20 lg:py-32">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-28 lg:space-y-40"
        >
          {/* ── HERO ── */}
          <motion.div variants={itemVariants} className="max-w-4xl">
            <p className="text-[#737373] text-xs font-mono tracking-widest uppercase mb-8">
              {greeting}, {firstName}
            </p>
            <h1 className="text-6xl md:text-8xl lg:text-9xl tracking-tighter font-medium leading-[0.9] mb-12 uppercase text-[#FAFAFA] mix-blend-difference">
              ZERO<br />
              <span className="text-[#737373]">DATA.</span>
            </h1>
            <p className="text-lg md:text-xl text-[#737373] max-w-2xl leading-relaxed mb-12">
              Your canvas is blank. We need inputs to build your knowledge graph, track your retention, and identify your weak points. 
            </p>
            <div className="flex flex-col sm:flex-row gap-6">
              <PrimaryButton onClick={() => navigate("/tutor")}>
                Start First Session
              </PrimaryButton>
            </div>
          </motion.div>

          {/* ── OVERVIEW CARDS (No fills, layered typography) ── */}
          <motion.div variants={itemVariants} className="border-t border-[#262626] pt-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16 lg:gap-24">
              <div className="group relative">
                <span className="absolute -top-10 -left-6 md:-top-16 md:-left-8 text-8xl md:text-9xl tracking-tighter font-medium text-[#1A1A1A] -z-10 select-none">
                  01
                </span>
                <Bot className="w-8 h-8 text-[#737373] mb-6 group-hover:text-[#FF3D00] transition-colors duration-200" strokeWidth={1.5} />
                <h3 className="text-2xl tracking-tight uppercase mb-4">The Nexus</h3>
                <p className="text-[#737373] text-sm leading-relaxed">
                  Engage our AI tutor to break down complex topics. Conversations are analyzed to build your personalized knowledge graph.
                </p>
              </div>

              <div className="group relative">
                <span className="absolute -top-10 -left-6 md:-top-16 md:-left-8 text-8xl md:text-9xl tracking-tighter font-medium text-[#1A1A1A] -z-10 select-none">
                  02
                </span>
                <Layers className="w-8 h-8 text-[#737373] mb-6 group-hover:text-[#FF3D00] transition-colors duration-200" strokeWidth={1.5} />
                <h3 className="text-2xl tracking-tight uppercase mb-4">Active Recall</h3>
                <p className="text-[#737373] text-sm leading-relaxed">
                  Generate flashcards from your notes and study materials. We use spaced repetition to encode information into your long-term memory.
                </p>
              </div>

              <div className="group relative">
                <span className="absolute -top-10 -left-6 md:-top-16 md:-left-8 text-8xl md:text-9xl tracking-tighter font-medium text-[#1A1A1A] -z-10 select-none">
                  03
                </span>
                <Mic2 className="w-8 h-8 text-[#737373] mb-6 group-hover:text-[#FF3D00] transition-colors duration-200" strokeWidth={1.5} />
                <h3 className="text-2xl tracking-tight uppercase mb-4">Voice Recall</h3>
                <p className="text-[#737373] text-sm leading-relaxed">
                  The ultimate test of true mastery. Explain concepts out loud securely. If you can't explain it simply, you don't understand it well enough.
                </p>
              </div>
            </div>
          </motion.div>

          {/* ── QUICK ACTIONS (Large Typographic Menu) ── */}
          <motion.div variants={itemVariants} className="pt-8 pb-20">
            <div className="flex flex-col">
              {[
                { title: "Ask AI Tutor", dest: "/tutor" },
                { title: "Create Flashcards", dest: "/flashcards" },
                { title: "Take Assessment", dest: "/quiz" },
                { title: "Voice Practice", dest: "/voice-recall" },
              ].map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(action.dest)}
                  className="group flex items-center justify-between py-6 md:py-8 border-b border-[#262626] text-left w-full border-t first:border-t-[#262626]"
                >
                  <span className="text-4xl md:text-5xl lg:text-7xl tracking-tighter text-[#737373] group-hover:text-[#FF3D00] transition-colors duration-200">
                    {action.title}
                  </span>
                  <ArrowRight className="w-6 h-6 md:w-12 md:h-12 text-[#262626] group-hover:text-[#FF3D00] transition-all duration-200 group-hover:translate-x-4" strokeWidth={1} />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
