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
  X,
  Menu,
  MoreHorizontal,
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
  { icon: LayoutDashboard, label: "Dashboard",       path: "/" },
  { icon: Bot,             label: "AI Tutor",        path: "/tutor" },
  { icon: Layers,          label: "Flashcards",      path: "/flashcards" },
  { icon: FileQuestion,    label: "Quiz",             path: "/quiz" },
  { icon: Mic,             label: "Voice Recall",    path: "/voice-recall" },
  { icon: Network,         label: "Knowledge Graph", path: "/knowledge-graph" },
  { icon: FolderOpen,      label: "Workspace",       path: "/workspace" },
];

const bottomItems = [
  { icon: Settings, label: "Settings", path: "/settings" },
];

const mobileBottomNav = [
  { icon: LayoutDashboard, label: "Home",  path: "/" },
  { icon: Bot,             label: "Tutor", path: "/tutor" },
  { icon: Layers,          label: "Cards", path: "/flashcards" },
  { icon: FileQuestion,    label: "Quiz",  path: "/quiz" },
  { icon: MoreHorizontal,  label: "More",  path: "__more__" },
];

// ── Desktop Sidebar Item ─────────────────────────────────────

function SidebarItem({
  icon: Icon,
  label,
  path,
  isActive,
  collapsed,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={path}
      onClick={onClick}
      className={cn(
        "relative flex items-center w-full py-2.5 text-xs font-bold tracking-widest uppercase transition-all duration-150 group",
        collapsed ? "justify-center px-0" : "justify-start px-3 gap-3",
        isActive
          ? "bg-[#FAFAFA] text-[#0A0A0A]"
          : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
      )}
    >
      {isActive && (
        <motion.div
          layoutId="activeNav"
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF3D00]"
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
            className="whitespace-nowrap overflow-hidden text-left leading-none"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

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

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const location = useLocation();
  const { user, logout } = useAuthStore();
  const openNexus = useNexusStore((s) => s.openNexus);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "[" &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
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

  const allDrawerItems = [...navItems, ...bottomItems];

  return (
    <>
      {/* ─────────────────────────────────────────────────────────
          DESKTOP SIDEBAR (lg+)
      ───────────────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.3, ease: easing }}
        className="hidden lg:flex flex-col h-screen bg-[#0A0A0A] border-r border-[#262626] overflow-hidden shrink-0"
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-16 border-b border-[#262626] shrink-0 overflow-hidden",
            collapsed ? "justify-center px-0" : "justify-start gap-3 px-4",
          )}
        >
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
                className="text-sm font-bold tracking-[0.2em] text-[#FAFAFA] whitespace-nowrap overflow-hidden uppercase text-left"
              >
                MENTORAI
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-hidden">
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

        <div className="border-t border-[#262626] mx-2" />

        {/* Command Palette */}
        <div className="px-2 py-2 overflow-hidden">
          <button
            onClick={openNexus}
            className={cn(
              "relative flex items-center w-full py-2.5 text-xs font-bold tracking-widest text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626] transition-all duration-150 group uppercase overflow-hidden",
              collapsed ? "justify-center px-0" : "justify-start px-3 gap-3",
            )}
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
                  <span className="text-left">Nexus</span>
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

        <div className="border-t border-[#262626] mx-2" />

        {/* Bottom items (Settings) */}
        <div className="px-2 py-2 space-y-0.5 overflow-hidden">
          {bottomItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex items-center w-full py-2.5 text-xs font-bold tracking-widest uppercase transition-all duration-150 group overflow-hidden",
                  collapsed ? "justify-center px-0" : "justify-start px-3 gap-3",
                  isActive
                    ? "bg-[#FAFAFA] text-[#0A0A0A]"
                    : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavBottom"
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF3D00]"
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
                      className="whitespace-nowrap overflow-hidden text-left leading-none"
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

        {/* User + Collapse toggle */}
        <div className="border-t border-[#262626] px-2 py-3 flex items-center justify-between gap-2 overflow-hidden">
          <div
            className={cn(
              "flex items-center gap-2 min-w-0 relative group flex-1 overflow-hidden",
              collapsed && "justify-center",
            )}
          >
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
                  <span className="text-[10px] font-bold tracking-widest text-[#FAFAFA] truncate uppercase text-left">
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
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </motion.aside>

      {/* ─────────────────────────────────────────────────────────
          TABLET SIDEBAR (md only — icon rail, fixed)
      ───────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex lg:hidden flex-col w-16 h-screen bg-[#0A0A0A] border-r border-[#262626] fixed left-0 top-0 z-40">
        {/* Logo */}
        <div className="flex items-center justify-center h-16 border-b border-[#262626] shrink-0">
          <div className="w-8 h-8 bg-[#FF3D00] flex items-center justify-center">
            <span className="text-xs font-black text-[#0A0A0A]">M</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-hidden">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center justify-center p-2.5 transition-all duration-150 relative group",
                  isActive
                    ? "bg-[#FAFAFA] text-[#0A0A0A]"
                    : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF3D00]" />
                )}
                <item.icon className="w-4 h-4 shrink-0" />
                <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
                  {item.label}
                </div>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-[#262626] mx-2" />

        {/* Nexus */}
        <div className="px-2 py-2">
          <button
            onClick={openNexus}
            className="flex items-center justify-center p-2.5 w-full text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626] transition-all relative group"
          >
            <Command className="w-4 h-4" />
            <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
              Nexus (⌘K)
            </div>
          </button>
        </div>

        <div className="border-t border-[#262626] mx-2" />

        {/* Settings */}
        {bottomItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <div key={item.path} className="px-2 py-2">
              <NavLink
                to={item.path}
                className={cn(
                  "flex items-center justify-center p-2.5 transition-all relative group",
                  isActive
                    ? "bg-[#FAFAFA] text-[#0A0A0A]"
                    : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF3D00]" />
                )}
                <item.icon className="w-4 h-4" />
                <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
                  {item.label}
                </div>
              </NavLink>
            </div>
          );
        })}

        {/* User avatar */}
        <div className="border-t border-[#262626] px-2 py-3 flex justify-center">
          <div className="w-8 h-8 bg-[#FF3D00] flex items-center justify-center relative group cursor-pointer">
            <span className="text-xs font-black text-[#0A0A0A]">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
            <div className="absolute left-full ml-3 px-3 py-2 bg-[#0A0A0A] border border-[#262626] text-[10px] font-bold tracking-widest text-[#FAFAFA] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 uppercase">
              {user?.name}
            </div>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────
          MOBILE TOP BAR
      ───────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-[#0A0A0A] border-b border-[#262626] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#FF3D00] flex items-center justify-center">
            <span className="text-xs font-black text-[#0A0A0A]">M</span>
          </div>
          <span className="text-sm font-bold tracking-[0.2em] text-[#FAFAFA] uppercase">
            MENTORAI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNexus}
            className="p-2 text-[#737373] hover:text-[#FAFAFA] transition-colors"
          >
            <Command className="w-5 h-5" />
          </button>
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 text-[#737373] hover:text-[#FAFAFA] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
          MOBILE BOTTOM NAV  ← CENTERED
      ───────────────────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A] border-t border-[#262626] flex items-stretch h-16"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {mobileBottomNav.map((item) => {
          if (item.path === "__more__") {
            return (
              <button
                key="more"
                onClick={() => setMobileDrawerOpen(true)}
                // ↓ CHANGED: justify-center so the inner column sits in the middle
                className="flex flex-1 items-center justify-center"
              >
                {/* ↓ CHANGED: items-center removes left-align; no pl-3 / w-full needed */}
                <div className="flex flex-col items-center gap-[3px] text-[#737373] hover:text-[#FAFAFA] transition-colors">
                  <item.icon className="w-5 h-5" />
                  <span className="text-[9px] font-bold tracking-wider uppercase leading-none">
                    {item.label}
                  </span>
                </div>
              </button>
            );
          }

          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              // ↓ CHANGED: justify-center so content sits in the middle of each cell
              className={cn(
                "relative flex flex-1 items-center justify-center transition-colors",
                isActive ? "text-[#FAFAFA]" : "text-[#737373] hover:text-[#FAFAFA]",
              )}
            >
              {/* ↓ active bar now spans the full cell width */}
              {isActive && (
                <span className="absolute top-0 left-0 right-0 h-[2px] bg-[#FF3D00]" />
              )}
              {/* ↓ CHANGED: items-center for vertical + horizontal centering; no pl-3 / w-full */}
              <div className="flex flex-col items-center gap-[3px]">
                <item.icon className="w-5 h-5" />
                <span className="text-[9px] font-bold tracking-wider uppercase leading-none">
                  {item.label}
                </span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* ─────────────────────────────────────────────────────────
          MOBILE FULL DRAWER
      ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-50 bg-black/70"
              onClick={() => setMobileDrawerOpen(false)}
            />

            {/* Drawer panel */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: easing }}
              className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 bg-[#0A0A0A] border-r border-[#262626] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-14 border-b border-[#262626] shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-[#FF3D00] flex items-center justify-center">
                    <span className="text-xs font-black text-[#0A0A0A]">M</span>
                  </div>
                  <span className="text-sm font-bold tracking-[0.2em] text-[#FAFAFA] uppercase">
                    MENTORAI
                  </span>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 text-[#737373] hover:text-[#FAFAFA] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Nav items */}
              <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
                {allDrawerItems.map((item) => {
                  const isActive =
                    item.path === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileDrawerOpen(false)}
                      className={cn(
                        "relative flex items-center w-full py-3 px-3 text-xs font-bold tracking-widest uppercase transition-all duration-150",
                        isActive
                          ? "bg-[#FAFAFA] text-[#0A0A0A]"
                          : "text-[#737373] hover:text-[#FAFAFA] hover:bg-[#262626]",
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF3D00]" />
                      )}
                      <div className="flex items-center gap-3 w-full">
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="text-left leading-none">{item.label}</span>
                      </div>
                    </NavLink>
                  );
                })}
              </nav>

              {/* Footer */}
              <div className="border-t border-[#262626] px-4 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-[#FF3D00] flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-[#0A0A0A]">
                      {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold tracking-widest text-[#FAFAFA] uppercase truncate max-w-[140px]">
                    {user?.name}
                  </span>
                </div>
                <button
                  onClick={() => { logout(); setMobileDrawerOpen(false); }}
                  className="p-2 text-[#737373] hover:text-[#FF3D00] transition-colors shrink-0"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}