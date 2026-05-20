import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/layout/PageWrapper";
import ApiKeySettings from "@/components/Settings/ApiKeySettings";
import { useAuthStore } from "@/store/authStore";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

const PrimaryButton = ({
  children, onClick, className, disabled,
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
      "bg-transparent px-4 sm:px-6 py-3 sm:py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
      "disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
      className,
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: easing }}
      className="absolute inset-x-0 bottom-0 h-0.5 bg-[#FF3D00]"
    />
    <motion.div
      variants={{ initial: { scaleX: 1, originX: 1 }, hover: { scaleX: 0, originX: 1 } }}
      transition={{ duration: 0.4, ease: easing }}
      className="absolute inset-x-0 bottom-0 h-px bg-[#262626]"
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
    if (!user) return;
    setName(user.name || "");
    setStudyGoal(user.studyGoalMinutes || 60);
    setSubjects(user.subjects || []);
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
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
      } = { name, subjects, studyGoalMinutes: studyGoal };

      if (openrouterApiKey.trim()) {
        updates.openrouterApiKey = openrouterApiKey.trim();
      }

      await updateProfile(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // handled elsewhere
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageWrapper>
      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-8 sm:pb-16 md:pb-32">
        {/* NOISE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* ── HERO ── */}
        <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-12"
          >
            <div>
              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-6xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none"
              >
                SETTINGS.
              </motion.h1>
              <motion.div
                variants={fadeUp}
                className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6"
              >
                <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  MANAGE PREFERENCES
                </p>
              </motion.div>
            </div>

            {/* Save button — full width on mobile */}
            <motion.div variants={fadeUp} className="w-full sm:w-auto">
              <PrimaryButton
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="w-full sm:w-auto justify-center"
              >
                {saved
                  ? "SAVED"
                  : isSaving
                    ? "SAVING..."
                    : "SAVE CHANGES"}
                {!saved && !isSaving && <ArrowRight className="w-4 h-4 ml-1" />}
              </PrimaryButton>
            </motion.div>
          </motion.div>
        </div>

        {/* ── CONTENT ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-8 sm:py-12 md:py-16">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 lg:gap-24"
          >
            <motion.div
              variants={fadeUp}
              className="lg:col-span-8 space-y-10 sm:space-y-14 md:space-y-16"
            >
              {isLoading ? (
                <div className="space-y-8 sm:space-y-12 w-full">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-8 w-48 bg-[#1A1A1A] animate-pulse" />
                    <div className="h-px flex-1 bg-[#262626]" />
                  </div>
                  <div className="space-y-6 sm:space-y-8">
                    <div className="h-20 w-full border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
                    <div className="h-20 w-full border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
                    <div className="h-20 w-full border-b border-[#262626] bg-[#0A0A0A] animate-pulse" />
                  </div>
                </div>
              ) : (
                <>
                  {/* ── PROFILE ── */}
                  <section>
                    <div className="flex items-center gap-4 mb-8 sm:mb-12">
                      <h2 className="text-xl sm:text-3xl font-bold tracking-tighter uppercase">
                        PROFILE
                      </h2>
                      <div className="h-px flex-1 bg-[#262626]" />
                      <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase hidden sm:block">
                        01 ITEMS
                      </span>
                    </div>

                    <div className="space-y-6 sm:space-y-8">
                      {/* Name */}
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

                      {/* Email (read-only) */}
                      <div>
                        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                          EMAIL ADDRESS
                        </label>
                        <input
                          value={user?.email || ""}
                          disabled
                          placeholder="EMAIL..."
                          className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#737373] focus:outline-none opacity-50 cursor-not-allowed uppercase"
                        />
                      </div>

                      {/* OpenRouter key */}
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
                              ? "ENTER NEW KEY TO REPLACE..."
                              : "PASTE YOUR OPENROUTER KEY..."
                          }
                          className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors"
                        />
                        <p className="mt-3 text-[10px] leading-5 tracking-[0.16em] text-[#737373] uppercase">
                          {user?.hasOpenrouterApiKey
                            ? "A key is saved. Leave blank to keep it."
                            : "Your key is used before the shared fallback."}
                        </p>
                      </div>

                      {/* Study goal */}
                      <div>
                        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                          DAILY STUDY GOAL (MINUTES)
                        </label>
                        <input
                          type="number"
                          value={studyGoal}
                          onChange={(e) =>
                            setStudyGoal(Math.max(1, parseInt(e.target.value) || 1))
                          }
                          min={1}
                          className="w-full bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors"
                        />
                      </div>

                      {/* Subjects */}
                      <div>
                        <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
                          SUBJECTS
                        </label>

                        {/* Subject tags */}
                        {subjects.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {subjects.map((subject) => (
                              <div
                                key={subject}
                                className="flex items-center gap-2 border border-[#262626] px-3 py-1.5"
                              >
                                <span className="text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase">
                                  {subject}
                                </span>
                                <button
                                  onClick={() => handleRemoveSubject(subject)}
                                  className="text-[#737373] hover:text-[#FF3D00] transition-colors"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add subject */}
                        <div className="flex gap-3 items-end">
                          <input
                            value={newSubject}
                            onChange={(e) => setNewSubject(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddSubject();
                              }
                            }}
                            placeholder="ADD SUBJECT..."
                            className="flex-1 bg-transparent border-b border-[#262626] pb-2 text-sm text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase"
                          />
                          <button
                            onClick={handleAddSubject}
                            disabled={!newSubject.trim()}
                            className="border border-[#262626] px-4 py-2 text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] hover:border-[#FAFAFA] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            ADD
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ── API KEY SETTINGS ── */}
                  <section>
                    <ApiKeySettings />
                  </section>

                  {/* ── MOBILE SAVE BUTTON (bottom of form, easier reach) ── */}
                  <div className="sm:hidden pt-4 border-t border-[#262626]">
                    <PrimaryButton
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full justify-center"
                    >
                      {saved ? "SAVED" : isSaving ? "SAVING..." : "SAVE CHANGES"}
                      {!saved && !isSaving && <ArrowRight className="w-4 h-4 ml-1" />}
                    </PrimaryButton>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
}