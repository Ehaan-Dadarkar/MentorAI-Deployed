import { create } from "zustand";
import api from "@/lib/axios";
import { openApiKeyGate } from "@/lib/apiKeyGate";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphMeta,
  KnowledgeGraphNode,
} from "@/types";

interface KnowledgeGraphResponse {
  success: boolean;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  meta: KnowledgeGraphMeta;
}

interface KnowledgeGraphState {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  meta: KnowledgeGraphMeta | null;
  isLoading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  subjectFilters: string[];
  showWeakOnly: boolean;
  query: string;
  fetchGraph: (options?: { useAi?: boolean; force?: boolean }) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void;
  toggleSubjectFilter: (subject: string) => void;
  clearSubjectFilters: () => void;
  setShowWeakOnly: (value: boolean) => void;
  setQuery: (value: string) => void;
  clearFilters: () => void;
}

export const useKnowledgeGraphStore = create<KnowledgeGraphState>((set, get) => ({
  nodes: [],
  edges: [],
  meta: null,
  isLoading: false,
  error: null,
  selectedNodeId: null,
  subjectFilters: [],
  showWeakOnly: false,
  query: "",

  fetchGraph: async (options = {}) => {
    const { useAi = true, force = false } = options;
    const { nodes, isLoading } = get();

    if (!force && nodes.length > 0) return;
    if (isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const { data } = await api.get<KnowledgeGraphResponse>("/knowledge-graph", {
        params: {
          ...(useAi ? {} : { ai: "false" }),
        },
      });

      set({
        nodes: data.nodes || [],
        edges: data.edges || [],
        meta: data.meta || null,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      if (error?.response?.status === 402) {
        openApiKeyGate(true);
        set({ isLoading: false, error: null });
        return;
      }

      const fallback = "Failed to load knowledge graph";
      const message =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : fallback;

      set({ isLoading: false, error: message || fallback });
    }
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  toggleSubjectFilter: (subject) =>
    set((state) => {
      const clean = String(subject || "").trim();
      if (!clean) return state;

      const exists = state.subjectFilters.includes(clean);
      return {
        subjectFilters: exists
          ? state.subjectFilters.filter((entry) => entry !== clean)
          : [...state.subjectFilters, clean],
      };
    }),

  clearSubjectFilters: () => set({ subjectFilters: [] }),

  setShowWeakOnly: (value) => set({ showWeakOnly: value }),

  setQuery: (value) => set({ query: value }),

  clearFilters: () =>
    set({
      subjectFilters: [],
      showWeakOnly: false,
      query: "",
    }),
}));
