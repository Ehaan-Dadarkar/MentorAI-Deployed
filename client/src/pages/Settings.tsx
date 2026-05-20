import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageWrapper } from "@/components/layout/PageWrapper";
import ApiKeySettings from "@/components/Settings/ApiKeySettings";
import { useAuthStore } from "@/store/authStore";
import { Save, Plus, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Animation Config ─────────────────────
const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easing },
  },
};

// ── Button Components ─────────────────────
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
      "group relative inline-flex items-center gap-2 overflow-hidden",
      "bg-transparent px-6 py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
      "disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    {/* Accent underline - grows on hover */}
    <motion.div
      variants={{
        initial: { scaleX: 0, originX: 0 },
        hover: { scaleX: 1, originX: 0 },
      }}
      transition={{ duration: 0.4, ease: easing }}
      className="absolute inset-x-0 bottom-0 h-0.5 bg-[#FF3D00]"
    />
    {/* Base line - shrinks on hover */}
    <motion.div
      variants={{
        initial: { scaleX: 1, originX: 1 },
        hover: { scaleX: 0, originX: 1 },
      }}
      transition={{ duration: 0.4, ease: easing }}
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
      "group relative inline-flex items-center gap-2 overflow-hidden",
      "bg-transparent px-4 py-3",
      "text-[10px] font-bold tracking-widest text-[#737373] uppercase cursor-pointer",
      "hover:text-[#FAFAFA] transition-colors",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{
        initial: { scaleX: 0, originX: 0 },
        hover: { scaleX: 1, originX: 0 },
      }}
      transition={{ duration: 0.4, ease: easing }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#FAFAFA]"
    />
  </motion.button>
);

export default function Settings() {
  const { user, updateProfile } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [studyGoal, setStudyGoal] = useState(user?.studyGoalMinutes || 60);
  const [newSubject, setNewSubject] = useState("");
  const [subjects, setSubjects] = useState<string[]>(user?.subjects || []);
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    setName(user.name || "");
    setStudyGoal(user.studyGoalMinutes || 60);
    setSubjects(user.subjects || []);
  }, [user]);

  // Simulate loading state to use skeleton pattern
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleAddSubject = () => {
    if (newSubject.trim() && !subjects.includes(newSubject.trim())) {
      setSubjects([...subjects, newSubject.trim()]);
      setNewSubject("");
    }
  };

  const handleRemoveSubject = (subject: string) => {
    setSubjects(subjects.filter((s) => s !== subject));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      const updates: {
        name: string;
        subjects: string[];
        studyGoalMinutes: number;
        openrouterApiKey?: string;
      } = {
        name,
        subjects,
        studyGoalMinutes: studyGoal,
      };

      if (openrouterApiKey.trim()) {
        updates.openrouterApiKey = openrouterApiKey.trim();
      }

      await updateProfile(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handled elsewhere
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageWrapper>
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-32">
        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-50"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        {/* HERO SECTION */}
        <div className="relative pt-32 pb-16 px-8 md:px-16 border-b border-[#262626]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-12"
          >
            <div>
              <motion.h1
                variants={fadeUp}
                className="text-7xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none"
              >
                SETTINGS.
              </motion.h1>
              <motion.div
                variants={fadeUp}
                className="mt-6 flex items-center gap-6"
              >
                <div className="h-1 w-12 bg-[#FF3D00]" />
                <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  MANAGE PREFERENCES
                </p>
              </motion.div>
            </div>

            <motion.div
              variants={fadeUp}
              className="flex min-w-50 flex-col gap-4"
            >
              <PrimaryButton onClick={handleSave} disabled={isSaving || isLoading}>
                {saved ? "SAVED SUCCESSFULLY" : isSaving ? "SAVING..." : "SAVE CHANGES"}
                {!saved && !isSaving && <ArrowRight className="w-4 h-4 ml-1" />}
              </PrimaryButton>
            </motion.div>
          </motion.div>
        </div>

        {/* MAIN CONTENT */}
        <div className="max-w-7xl mx-auto px-8 md:px-16 py-16">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24"
          >
            <motion.div variants={fadeUp} className="lg:col-span-8 space-y-16">
              {isLoading ? (
                // SKELETON
                <div className="space-y-12 w-full">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-8 w-48 bg-[#1A1A1A] animate-pulse" />
                    <div className="h-px flex-1 bg-[#262626]" />
                  </div>
                  <div className="space-y-8">
                    <div className="h-24 w-full border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
                    <div className="h-24 w-full border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Profile Config */}
                  <section>
                    <div className="flex items-center gap-4 mb-12">
                      <h2 className="text-3xl font-bold tracking-tighter uppercase">
                        PROFILE
                      </h2>
                      <div className="h-px flex-1 bg-[#262626]" />
                      <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
                        01 ITEMS
                      </span>
                    </div>

                    <div className="space-y-8">
                      <div>
                        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                          FULL NAME
                        </label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="ENTER NAME..."
                          className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                          EMAIL ADDRESS
                        </label>
                        <input
                          value={user?.email || ""}
                          disabled
                          placeholder="EMAIL..."
                          className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#737373] placeholder:text-[#262626] focus:outline-none opacity-50 cursor-not-allowed uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                          OPENROUTER API KEY
                        </label>
                        <input
                          value={openrouterApiKey}
                          onChange={(e) => setOpenrouterApiKey(e.target.value)}
                          type="password"
                          placeholder={
                            user?.hasOpenrouterApiKey
                              ? "ENTER NEW KEY TO REPLACE SAVED KEY..."
                              : "PASTE YOUR OPENROUTER API KEY..."
                          }
                          className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors"
                        />
                        <p className="mt-3 text-[10px] leading-5 tracking-[0.16em] text-[#737373] uppercase">
                          {user?.hasOpenrouterApiKey
                            ? "A personal key is already saved. Leave this blank to keep it unchanged."
                            : "Your key stays on the server and is used before the shared fallback."}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* API Key Section */}
                  <section className="mt-8">
                    <ApiKeySettings />
                  </section>
                </>
              )}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
}
