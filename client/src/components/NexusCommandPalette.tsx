import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Bot,
  Mic,
  Layers,
  FileQuestion,
  Network,
  FolderOpen,
  Search,
  FileText,
  Sparkles,
  Play,
  Clock,
  ArrowRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNexusStore } from "@/store/nexusStore";
import type { LucideIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface Command {
  id: string;
  icon: LucideIcon;
  label: string;
  category: "Navigate" | "Actions" | "Recent";
  shortcut?: string;
  action: () => void;
}

// ── Fuzzy match ────────────────────────────────────────

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Component ──────────────────────────────────────────

export function NexusCommandPalette() {
  const { isOpen, closeNexus, recentItems, addRecent } = useNexusStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Navigation helper that tracks recent
  const go = useCallback(
    (path: string, label: string) => {
      addRecent(`nav:${path}`, label);
      closeNexus();
      navigate(path);
    },
    [navigate, closeNexus, addRecent],
  );

  const doAction = useCallback(
    (id: string, label: string, path: string) => {
      addRecent(id, label);
      closeNexus();
      navigate(path);
    },
    [navigate, closeNexus, addRecent],
  );

  // ── All commands ────────────────────────────────────

  const allCommands = useMemo<Command[]>(() => {
    const navCommands: Command[] = [
      {
        id: "nav:/",
        icon: LayoutDashboard,
        label: "Go to Dashboard",
        category: "Navigate",
        action: () => go("/", "Dashboard"),
      },
      {
        id: "nav:/tutor",
        icon: Bot,
        label: "Go to AI Tutor",
        category: "Navigate",
        action: () => go("/tutor", "AI Tutor"),
      },
      {
        id: "nav:/flashcards",
        icon: Layers,
        label: "Go to Flashcards",
        category: "Navigate",
        action: () => go("/flashcards", "Flashcards"),
      },
      {
        id: "nav:/quiz",
        icon: FileQuestion,
        label: "Go to Quiz",
        category: "Navigate",
        action: () => go("/quiz", "Quiz"),
      },
      {
        id: "nav:/voice-recall",
        icon: Mic,
        label: "Go to Voice Recall",
        category: "Navigate",
        action: () => go("/voice-recall", "Voice Recall"),
      },
      {
        id: "nav:/workspace",
        icon: FolderOpen,
        label: "Go to Workspace",
        category: "Navigate",
        action: () => go("/workspace", "Workspace"),
      },
      {
        id: "nav:/knowledge-graph",
        icon: Network,
        label: "Go to Knowledge Graph",
        category: "Navigate",
        action: () => go("/knowledge-graph", "Knowledge Graph"),
      },
    ];

    const actionCommands: Command[] = [
      {
        id: "act:new-note",
        icon: FileText,
        label: "New Note",
        category: "Actions",
        action: () =>
          doAction("act:new-note", "New Note", "/workspace?new=true"),
      },
      {
        id: "act:new-deck",
        icon: Layers,
        label: "New Deck",
        category: "Actions",
        action: () =>
          doAction("act:new-deck", "New Deck", "/flashcards?new=true"),
      },
      {
        id: "act:start-quiz",
        icon: Play,
        label: "Start Quiz",
        category: "Actions",
        action: () =>
          doAction("act:start-quiz", "Start Quiz", "/quiz?start=true"),
      },
      {
        id: "act:voice-session",
        icon: Mic,
        label: "Start Voice Recall Session",
        category: "Actions",
        action: () =>
          doAction(
            "act:voice-session",
            "Voice Recall Session",
            "/voice-recall?start=true",
          ),
      },
      {
        id: "act:gen-flashcards",
        icon: Sparkles,
        label: "Generate Flashcards",
        category: "Actions",
        action: () =>
          doAction(
            "act:gen-flashcards",
            "Generate Flashcards",
            "/flashcards?generate=true",
          ),
      },
    ];

    // Recent items from store
    const recentCommands: Command[] = recentItems.map((r) => {
      const iconMap: Record<string, LucideIcon> = {
        "nav:/": LayoutDashboard,
        "nav:/tutor": Bot,
        "nav:/flashcards": Layers,
        "nav:/quiz": FileQuestion,
        "nav:/voice-recall": Mic,
        "nav:/workspace": FolderOpen,
        "nav:/knowledge-graph": Network,
        "act:new-note": FileText,
        "act:new-deck": Layers,
        "act:start-quiz": Play,
        "act:voice-session": Mic,
        "act:gen-flashcards": Sparkles,
      };

      return {
        id: `recent:${r.id}`,
        icon: iconMap[r.id] || Clock,
        label: r.label,
        category: "Recent" as const,
        action: () => {
          const match = [...navCommands, ...actionCommands].find(
            (c) => c.id === r.id,
          );
          if (match) match.action();
        },
      };
    });

    return [...recentCommands, ...navCommands, ...actionCommands];
  }, [go, doAction, recentItems]);

  // ── Filtered commands ───────────────────────────────

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    return allCommands.filter(
      (cmd) => fuzzyMatch(query, cmd.label) || fuzzyMatch(query, cmd.category),
    );
  }, [query, allCommands]);

  // Group by category preserving order
  const grouped = useMemo(() => {
    const order: Command["category"][] = ["Recent", "Navigate", "Actions"];
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      const list = map.get(cmd.category) || [];
      list.push(cmd);
      map.set(cmd.category, list);
    }
    return order
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, commands: map.get(cat)! }));
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => grouped.flatMap((g) => g.commands), [grouped]);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on open, reset state
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Keyboard handler ────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % Math.max(flatList.length, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(
            (i) => (i - 1 + flatList.length) % Math.max(flatList.length, 1),
          );
          break;
        case "Enter":
          e.preventDefault();
          if (flatList[selectedIndex]) {
            flatList[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          closeNexus();
          break;
      }
    },
    [flatList, selectedIndex, closeNexus],
  );

  // ── Category badge colors ───────────────────────────

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "Navigate":
        return "border-[#FF3D00] text-[#FF3D00] bg-[#FF3D00]/5";
      case "Actions":
        return "border-[#FAFAFA] text-[#FAFAFA] bg-[#FAFAFA]/5";
      case "Recent":
        return "border-[#737373] text-[#737373] bg-[#737373]/5";
      default:
        return "border-[#262626] text-[#737373]";
    }
  };

  // ── Render ──────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0A0A0A]/90 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            onClick={closeNexus}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-2xl border border-[#262626] bg-[#0A0A0A] overflow-hidden"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.15 }}
            onKeyDown={handleKeyDown}
          >
            {/* Noise texture */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#262626]">
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-[#FF3D00]" />
                <h3 className="text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase">
                  NEXUS COMMAND
                </h3>
              </div>
              <button
                onClick={closeNexus}
                className="text-[#737373] hover:text-[#FAFAFA] transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search input */}
            <div className="relative z-10 px-6 py-4 border-b border-[#262626]">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TYPE COMMAND OR KEYWORD..."
                className="w-full bg-transparent text-sm text-[#FAFAFA] placeholder:text-[#262626] outline-none uppercase tracking-wide"
              />
            </div>

            {/* Results */}
            <div ref={listRef} className="relative z-10 max-h-[400px] overflow-y-auto py-4">
              {flatList.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                    NO MATCHES FOUND
                  </p>
                  <p className="text-xs text-[#737373] mt-2">
                    "{query}"
                  </p>
                </div>
              ) : (
                grouped.map((group) => {
                  let groupStartIndex = 0;
                  for (const g of grouped) {
                    if (g.category === group.category) break;
                    groupStartIndex += g.commands.length;
                  }

                  return (
                    <div key={group.category} className="mb-6 last:mb-0">
                      <div className="px-6 mb-3">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                          [ {group.category} ]
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.commands.map((cmd, i) => {
                          const flatIndex = groupStartIndex + i;
                          const isSelected = flatIndex === selectedIndex;
                          const CmdIcon = cmd.icon;

                          return (
                            <button
                              key={cmd.id}
                              data-index={flatIndex}
                              onClick={() => cmd.action()}
                              onMouseEnter={() => setSelectedIndex(flatIndex)}
                              className={cn(
                                "flex items-center gap-4 w-full px-6 py-3 text-sm transition-all duration-150",
                                isSelected
                                  ? "bg-[#FAFAFA] text-[#0A0A0A]"
                                  : "text-[#FAFAFA] hover:bg-[#262626]",
                              )}
                            >
                              <CmdIcon className="w-4 h-4 shrink-0" />
                              <span className="flex-1 text-left font-bold tracking-wide uppercase text-xs">
                                {cmd.label}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px] font-bold px-2 py-1 border uppercase tracking-widest",
                                  isSelected 
                                    ? "border-[#0A0A0A] text-[#0A0A0A] bg-[#0A0A0A]/5"
                                    : categoryColor(cmd.category),
                                )}
                              >
                                {cmd.category}
                              </span>
                              {isSelected && (
                                <ArrowRight className="w-4 h-4 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hints */}
            <div className="relative z-10 flex items-center gap-6 px-6 py-3 border-t border-[#262626] bg-[#0A0A0A]">
              <div className="flex items-center gap-2">
                <kbd className="text-[10px] font-bold tracking-widest border border-[#262626] px-2 py-1 text-[#737373] uppercase">
                  ↑↓
                </kbd>
                <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="text-[10px] font-bold tracking-widest border border-[#262626] px-2 py-1 text-[#737373] uppercase">
                  ↵
                </kbd>
                <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">Select</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="text-[10px] font-bold tracking-widest border border-[#262626] px-2 py-1 text-[#737373] uppercase">
                  ESC
                </kbd>
                <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">Close</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}