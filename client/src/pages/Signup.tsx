import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Mail, Lock, User, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const easing = [0.25, 0, 0, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easing } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3, ease: easing } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const PrimaryButton = ({
  onClick,
  children,
  className,
  disabled,
  type = "button",
}: any) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative border border-[#262626] bg-[#0A0A0A] px-6 py-4 text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase transition-all duration-300 hover:bg-[#FAFAFA] hover:text-[#0A0A0A] disabled:opacity-50 disabled:cursor-not-allowed",
      className,
    )}
  >
    <span className="relative z-10 flex items-center justify-center gap-2">
      {children}
    </span>
  </button>
);

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    try {
      await signup(name, email, password);
      navigate("/");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-[#FAFAFA] flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Fractal Noise Overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.015] mix-blend-overlay"
        style={{
          backgroundImage:
            'url(' +
            '"data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E"' +
            ')',
        }}
      />

      <div className="w-full max-w-xl mx-auto relative z-10">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-8 md:gap-12"
        >
          {/* Header */}
          <motion.div
            variants={fadeUp}
            className="flex flex-col gap-4 border-b border-[#262626] pb-6 md:pb-8"
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                [ REGISTRATION ]
              </span>
              <span className="h-px w-8 bg-[#262626]" />
            </div>
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none">
              SIGNUP.
            </h1>
          </motion.div>

          {/* Form card */}
          <motion.div
            variants={fadeUp}
            className="bg-[#0A0A0A] border border-[#262626] p-5 sm:p-8 md:p-12"
          >
            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border border-[#FF3D00] bg-[#FF3D00]/5 p-4 text-xs font-bold tracking-wider text-[#FF3D00] uppercase">
                      [ ERROR ] {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-5 md:space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block">
                    IDENTIFIER
                  </label>
                  <div className="relative border border-[#262626] bg-[#0A0A0A] group focus-within:border-[#FAFAFA] transition-colors duration-300">
                    <div className="absolute inset-y-0 left-0 flex items-center justify-center w-12 border-r border-[#262626] group-focus-within:border-[#FAFAFA] transition-colors duration-300">
                      <User className="w-4 h-4 text-[#737373] group-focus-within:text-[#FAFAFA] transition-colors duration-300" />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="CALLSIGN"
                      className="w-full bg-transparent border-none py-4 pl-16 pr-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:ring-0"
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block">
                    EMAIL ADDRESS
                  </label>
                  <div className="relative border border-[#262626] bg-[#0A0A0A] group focus-within:border-[#FAFAFA] transition-colors duration-300">
                    <div className="absolute inset-y-0 left-0 flex items-center justify-center w-12 border-r border-[#262626] group-focus-within:border-[#FAFAFA] transition-colors duration-300">
                      <Mail className="w-4 h-4 text-[#737373] group-focus-within:text-[#FAFAFA] transition-colors duration-300" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="USER@SYSTEM.IO"
                      className="w-full bg-transparent border-none py-4 pl-16 pr-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:ring-0"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block">
                    SECURITY KEY
                  </label>
                  <div className="relative border border-[#262626] bg-[#0A0A0A] group focus-within:border-[#FAFAFA] transition-colors duration-300">
                    <div className="absolute inset-y-0 left-0 flex items-center justify-center w-12 border-r border-[#262626] group-focus-within:border-[#FAFAFA] transition-colors duration-300">
                      <Lock className="w-4 h-4 text-[#737373] group-focus-within:text-[#FAFAFA] transition-colors duration-300" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="MIN 8 CHARACTERS"
                      className="w-full bg-transparent border-none py-4 pl-16 pr-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:ring-0"
                      required
                    />
                  </div>
                </div>
              </div>

              <PrimaryButton
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "INITIALIZING..." : "INITIALIZE ACCOUNT"}
                {!isLoading && (
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                )}
              </PrimaryButton>
            </form>
          </motion.div>

          {/* Footer link */}
          <motion.div
            variants={fadeUp}
            className="flex justify-between items-center text-[10px] font-bold tracking-[0.2em] uppercase border-t border-[#262626] pt-6 md:pt-8"
          >
            <span className="text-[#737373]">REGISTERED?</span>
            <Link
              to="/login"
              className="inline-link text-[#FAFAFA] hover:text-[#FF3D00] transition-colors flex items-center gap-2 py-2"
            >
              AUTHORIZE ACCESS <ArrowRight className="w-3 h-3" />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}