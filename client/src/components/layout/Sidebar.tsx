import { useState, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Bot,
  Mic,
  Layers,
  FileQuestion,
  Network,
  FolderOpen,
  Settings,
  Command,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useNexusStore } from "@/store/nexusStore";

const SIDEBAR_COLLAPSED_KEY = "mentorai-sidebar-collapsed";
const easing = [0.25, 0, 0, 1] as const;

interface SidebarNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
}

const navItems: SidebarNavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Bot, label: "AI Tutor", path: "/tutor" },
  { icon: Mic, label: "Voice Recall", path: "/voice-recall" },
  { icon: Layers, label: "Flashcards", path: "/flashcards" },
  { icon: FileQuestion, label: "Quiz", path: "/quiz" },
  { icon: Network, label: "Knowledge Graph", path: "/knowledge-graph" },
  { icon: FolderOpen, label: "Workspace", path: "/workspace" },
];

const bottomItems = [{ icon: Settings, label: "Settings", path: "/settings" }];

function SidebarItem({
  icon: Icon,
  label,
  path,
  isActive,
  collapsed,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  isActive: boolean;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={path}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-xs font-bold tracking-widest uppercase transition-all duration-150 relative group",
        isActive
          ? "bg-[#FAFAFA] text-[#0A0A0A]"
          : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
      )}
    >
      {isActive && (
        <motion.div
          layoutId="activeNav"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-full bg-[#FF3D00]"
          transition={{ duration: 0.15, ease: easing }}
        />
      )}
      <Icon className="w-4 h-4 shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="whitespace-nowrap overflow-hidden"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Tooltip when collapsed */}
      {collapsed && (
        <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
          {label}
        </div>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const openNexus = useNexusStore((s) => s.openNexus);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // [ key toggles collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "[" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapsed]);

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.3, ease: easing }}
      className="flex flex-col h-screen bg-[#0A0A0A] border-r border-[#262626] overflow-hidden shrink-0"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[#262626] shrink-0 overflow-hidden">
        <div className="w-8 h-8 bg-[#FF3D00] flex items-center justify-center shrink-0">
          <span className="text-xs font-black text-[#0A0A0A]">M</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="text-sm font-bold tracking-[0.2em] text-[#FAFAFA] whitespace-nowrap overflow-hidden uppercase"
            >
              MENTORAI
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-hidden">
        {navItems.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);

          return (
            <SidebarItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              isActive={isActive}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      {/* Divider */}
      <div className="border-t border-[#262626] mx-2" />

      {/* Command Palette Hint */}
      <div className="px-2 py-2 overflow-hidden">
        <button
          onClick={openNexus}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-xs font-bold tracking-widest text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626] transition-all duration-150 relative group uppercase overflow-hidden"
        >
          <Command className="w-4 h-4 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-between flex-1 whitespace-nowrap overflow-hidden"
              >
                <span>Nexus</span>
                <kbd className="text-[10px] font-bold tracking-widest text-[#737373] border border-[#262626] px-2 py-1 ml-2">
                  ⌘K
                </kbd>
              </motion.div>
            )}
          </AnimatePresence>
          {collapsed && (
            <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
              Nexus (⌘K)
            </div>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-[#262626] mx-2" />

      {/* Bottom items */}
      <div className="px-2 py-2 space-y-1 overflow-hidden">
        {bottomItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-xs font-bold tracking-widest uppercase transition-all duration-150 relative group overflow-hidden",
                isActive
                  ? "bg-[#FAFAFA] text-[#0A0A0A]"
                  : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNavBottom"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-full bg-[#FF3D00]"
                  transition={{ duration: 0.15, ease: easing }}
                />
              )}
              <item.icon className="w-4 h-4 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {collapsed && (
                <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
                  {item.label}
                </div>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* User + Collapse */}
      <div className="border-t border-[#262626] px-2 py-3 flex items-center justify-between gap-2 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0 relative group flex-1 overflow-hidden">
          <div className="w-8 h-8 bg-[#FF3D00] flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-[#0A0A0A]">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="min-w-0 flex items-center gap-2 overflow-hidden"
              >
                <span className="text-[10px] font-bold tracking-widest text-[#FAFAFA] truncate uppercase">
                  {user?.name}
                </span>
                <button
                  onClick={() => logout()}
                  className="text-[#737373] hover:text-[#FF3D00] transition-colors shrink-0"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {collapsed && (
            <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
              {user?.name}
            </div>
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          className="p-2 text-[#737373] hover:text-[#FAFAFA] transition-colors shrink-0 border border-[#262626] hover:border-[#FAFAFA]"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </motion.aside>
  );
}