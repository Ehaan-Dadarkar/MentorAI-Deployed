import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { useNexusStore } from "@/store/nexusStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { NexusCommandPalette } from "@/components/NexusCommandPalette";
import { LoadingSkeleton } from "@/components/ui/States";
import { cn } from "@/lib/utils";

// Lazy-loaded pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Tutor = lazy(() => import("@/pages/Tutor"));
const Flashcards = lazy(() => import("@/pages/Flashcards"));
const FlashcardDeckDetail = lazy(() => import("@/pages/FlashcardDeckDetail"));
const FlashcardStudy = lazy(() => import("@/pages/FlashcardStudy"));
const FlashcardStats = lazy(() => import("@/pages/FlashcardStats"));
const Quiz = lazy(() => import("@/pages/Quiz"));
const VoiceRecall = lazy(() => import("@/pages/VoiceRecall"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const KnowledgeGraph = lazy(() => import("@/pages/KnowledgeGraph"));
const Settings = lazy(() => import("@/pages/Settings"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <LoadingSkeleton />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const toggleNexus = useNexusStore((s) => s.toggleNexus);
  const hideSidebar = /^\/flashcards\/[^/]+\/study$/.test(location.pathname);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleNexus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleNexus]);

  return (
    <div
      className={cn(
        "flex h-screen bg-bg text-text-primary overflow-hidden",
        hideSidebar && "block",
      )}
    >
      {!hideSidebar && <Sidebar />}
      <NexusCommandPalette />
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<LoadingSkeleton />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tutor" element={<Tutor />} />
              <Route path="/flashcards" element={<Flashcards />} />
              <Route path="/flashcards/stats" element={<FlashcardStats />} />
              <Route path="/flashcards/:deckId/study" element={<FlashcardStudy />} />
              <Route path="/flashcards/:deckId" element={<FlashcardDeckDetail />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/voice-recall" element={<VoiceRecall />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/knowledge-graph" element={<KnowledgeGraph />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-bg">
          <LoadingSkeleton />
        </div>
      }
    >
      <Routes>
        <Route
          path="/login"
          element={
            <AuthRoute>
              <Login />
            </AuthRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <AuthRoute>
              <Signup />
            </AuthRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
