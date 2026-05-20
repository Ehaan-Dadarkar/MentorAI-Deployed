import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as d3 from "d3";
import { motion, AnimatePresence } from "framer-motion";
import { useKnowledgeGraphStore } from "@/store/knowledgeGraphStore";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphMeta,
  KnowledgeGraphNode,
  KnowledgeGraphNodeType,
} from "@/types";
import {
  RefreshCcw,
  Search,
  ZoomIn,
  ZoomOut,
  Target,
  Filter,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageWrapper } from "@/components/layout/PageWrapper";
import RateLimitBanner from "@/components/RateLimitBanner";
import { useRateLimitStore } from "@/store/rateLimitStore";

// ── Animation Config ────────────────────────────────────────
const easing = [0.25, 0, 0, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing } },
};

// ── Buttons ─────────────────────────────────────────────────

const PrimaryButton = ({
  children, onClick, className, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <motion.button
    whileHover="hover" initial="initial"
    onClick={onClick} disabled={disabled}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden",
      // ↓ responsive padding
      "bg-transparent px-4 sm:px-6 py-3 sm:py-4",
      "text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase",
      "disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#FF3D00]"
    />
    <motion.div
      variants={{ initial: { scaleX: 1, originX: 1 }, hover: { scaleX: 0, originX: 1 } }}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[1px] bg-[#262626]"
    />
  </motion.button>
);

const GhostButton = ({
  children, onClick, className, active, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  disabled?: boolean;
}) => (
  <motion.button
    whileHover="hover" initial="initial"
    onClick={onClick} disabled={disabled}
    className={cn(
      "group relative inline-flex items-center gap-2 overflow-hidden",
      "bg-transparent px-4 py-3",
      "text-[10px] font-bold tracking-widest uppercase transition-colors",
      active ? "text-[#FAFAFA]" : "text-[#737373] hover:text-[#FAFAFA]",
      className
    )}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.div
      variants={{ initial: { scaleX: active ? 1 : 0, originX: 0 }, hover: { scaleX: 1, originX: 0 } }}
      initial={active ? "hover" : "initial"}
      transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
      className="absolute inset-x-0 bottom-0 h-[1px] bg-[#FAFAFA]"
    />
  </motion.button>
);

const SecondaryButton = ({
  children, onClick, className, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick} disabled={disabled}
    className={cn(
      "group relative inline-flex items-center justify-center gap-2",
      // ↓ responsive padding
      "border border-[#262626] bg-[#0A0A0A] px-4 sm:px-6 py-3 sm:py-4",
      "text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase",
      "transition-all duration-300",
      "hover:bg-[#FAFAFA] hover:text-[#0A0A0A] hover:border-[#FAFAFA]",
      "disabled:opacity-50 disabled:pointer-events-none",
      className
    )}
  >
    {children}
  </button>
);

// ── Types ────────────────────────────────────────────────────

interface GraphTooltip {
  node: KnowledgeGraphNode;
  x: number;
  y: number;
}

interface GraphSimNode extends KnowledgeGraphNode, d3.SimulationNodeDatum {}

type GraphSimLink = d3.SimulationLinkDatum<GraphSimNode> & {
  source: string | GraphSimNode;
  target: string | GraphSimNode;
  type: KnowledgeGraphEdge["type"];
  relationship: string;
};

// ── Helpers ──────────────────────────────────────────────────

const RESOURCE_TYPES: KnowledgeGraphNodeType[] = ["quiz", "flashcard", "voice"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isResourceType(type: KnowledgeGraphNodeType): boolean {
  return RESOURCE_TYPES.includes(type);
}

function getNodeSize(node: KnowledgeGraphNode): number {
  if (node.type === "note") return clamp(16 + node.frequency * 0.85, 18, 34);
  if (node.type === "concept") return clamp(7 + node.frequency * 0.5, 8, 20);
  return clamp(9 + node.frequency * 0.35, 10, 20);
}

function getLabelOffset(node: KnowledgeGraphNode): number {
  if (node.type === "note") return getNodeSize(node) * 1.05 + 12;
  return getNodeSize(node) + 12;
}

function diamondPath(size: number): string {
  return `M 0 ${-size} L ${size} 0 L 0 ${size} L ${-size} 0 Z`;
}

function getNodeTypeLabel(type: KnowledgeGraphNodeType): string {
  if (type === "note") return "NOTE";
  if (type === "concept") return "CONCEPT";
  if (type === "quiz") return "QUIZ";
  if (type === "flashcard") return "FLASHCARD";
  return "VOICE";
}

function defaultMeta(): KnowledgeGraphMeta {
  return {
    generatedAt: new Date().toISOString(),
    nodeCount: 0,
    edgeCount: 0,
    usedAI: false,
    truncated: false,
    nodeTypes: { note: 0, concept: 0, quiz: 0, flashcard: 0, voice: 0 },
    edgeTypes: { contains: 0, generated: 0, practiced: 0, "concept-link": 0 },
  };
}

// ── Main Component ───────────────────────────────────────────

export default function KnowledgeGraph() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphSimNode, GraphSimLink> | null>(null);
  const remaining = useRateLimitStore((s) => s.remaining);
  const limit = useRateLimitStore((s) => s.limit);
  const resetTime = useRateLimitStore((s) => s.resetTime);

  const [viewport, setViewport] = useState({ width: 960, height: 640 });
  const [searchInput, setSearchInput] = useState("");
  const [tooltip, setTooltip] = useState<GraphTooltip | null>(null);
  // ↓ mobile inspector panel toggle
  const [showInspector, setShowInspector] = useState(false);

  const {
    nodes, edges, meta, isLoading, error,
    selectedNodeId, subjectFilters, showWeakOnly, query,
    fetchGraph, setSelectedNodeId, toggleSubjectFilter,
    clearSubjectFilters, setShowWeakOnly, setQuery, clearFilters,
  } = useKnowledgeGraphStore();

  const isEmpty = !isLoading && !error && nodes.length === 0;

  useEffect(() => { fetchGraph({ useAi: true }); }, [fetchGraph]);
  useEffect(() => { setSearchInput(query); }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(searchInput); }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput, setQuery]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = Math.max(320, Math.floor(entries[0].contentRect.width));
      // ↓ taller ratio on mobile for better visibility
      const height = Math.max(360, Math.floor(width * 0.62));
      setViewport({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ↓ auto-open inspector on mobile when a node is selected
  useEffect(() => {
    if (selectedNodeId) setShowInspector(true);
  }, [selectedNodeId]);

  const subjects = useMemo(
    () => Array.from(new Set(nodes.map((node) => node.subject))).sort((a, b) => a.localeCompare(b)),
    [nodes],
  );

  const visibleNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedSubjects = new Set(subjectFilters);
    return nodes.filter((node) => {
      if (showWeakOnly && node.mastery >= 45) return false;
      if (selectedSubjects.size > 0 && !selectedSubjects.has(node.subject)) return false;
      if (!normalizedQuery) return true;
      return (
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.subject.toLowerCase().includes(normalizedQuery) ||
        node.type.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [nodes, query, showWeakOnly, subjectFilters]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
    [edges, visibleNodeIds],
  );

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) || null : null;

  const selectedNoteConcepts = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "note") return [];
    return visibleEdges
      .filter((edge) => edge.type === "contains" && edge.source === selectedNode.id)
      .map((edge) => nodeById.get(edge.target))
      .filter((node): node is KnowledgeGraphNode => Boolean(node));
  }, [nodeById, selectedNode, visibleEdges]);

  const selectedNoteResources = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "note") return [];
    return visibleEdges
      .filter((edge) => (edge.type === "generated" || edge.type === "practiced") && edge.source === selectedNode.id)
      .map((edge) => {
        const node = nodeById.get(edge.target);
        if (!node) return null;
        return { node, edge };
      })
      .filter((entry): entry is { node: KnowledgeGraphNode; edge: KnowledgeGraphEdge } => Boolean(entry))
      .sort((a, b) => b.node.mastery - a.node.mastery);
  }, [nodeById, selectedNode, visibleEdges]);

  const selectedConceptNotes = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "concept") return [];
    return visibleEdges
      .filter((edge) => edge.type === "contains" && edge.target === selectedNode.id)
      .map((edge) => nodeById.get(edge.source))
      .filter((node): node is KnowledgeGraphNode => Boolean(node))
      .sort((a, b) => b.mastery - a.mastery);
  }, [nodeById, selectedNode, visibleEdges]);

  const selectedConceptLinks = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "concept") return [];
    return visibleEdges
      .filter((edge) => edge.type === "concept-link" && (edge.source === selectedNode.id || edge.target === selectedNode.id))
      .map((edge) => {
        const neighborId = edge.source === selectedNode.id ? edge.target : edge.source;
        const neighbor = nodeById.get(neighborId);
        if (!neighbor || neighbor.type !== "concept") return null;
        return { neighbor, relationship: edge.relationship };
      })
      .filter((value): value is { neighbor: KnowledgeGraphNode; relationship: string } => Boolean(value));
  }, [nodeById, selectedNode, visibleEdges]);

  const selectedResourceParent = useMemo(() => {
    if (!selectedNode || !isResourceType(selectedNode.type)) return null;
    const parentEdge = visibleEdges.find((edge) =>
      (edge.type === "generated" || edge.type === "practiced") && edge.target === selectedNode.id
    );
    if (!parentEdge) return null;
    return nodeById.get(parentEdge.source) || null;
  }, [nodeById, selectedNode, visibleEdges]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (visibleNodeIds.has(selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [selectedNodeId, setSelectedNodeId, visibleNodeIds]);

  // ── D3 Graph ─────────────────────────────────────────────

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();
    simulationRef.current?.stop();
    setTooltip(null);

    if (visibleNodes.length === 0) return;

    const root = svg.append("g").attr("class", "graph-root").attr("transform", "translate(0,0)");

    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, 45, 70, 100])
      .range(["#FF3D00", "#737373", "#A3A3A3", "#FAFAFA"]);

    const graphNodes: GraphSimNode[] = visibleNodes.map((node) => ({ ...node }));
    const graphLinks: GraphSimLink[] = visibleEdges.map((edge) => ({ ...edge }));

    const subjectsInView = Array.from(new Set(graphNodes.map((node) => node.subject)));
    const cols = Math.max(1, Math.ceil(Math.sqrt(subjectsInView.length)));
    const rows = Math.max(1, Math.ceil(subjectsInView.length / cols));
    const subjectAnchors = new Map<string, { x: number; y: number }>();

    subjectsInView.forEach((subject, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      subjectAnchors.set(subject, {
        x: ((col + 1) * viewport.width) / (cols + 1),
        y: ((row + 1) * viewport.height) / (rows + 1),
      });
    });

    const anchorForNode = (node: GraphSimNode) =>
      subjectAnchors.get(node.subject) || { x: viewport.width / 2, y: viewport.height / 2 };

    const link = root
      .append("g")
      .attr("stroke-linecap", "square")
      .selectAll<SVGLineElement, GraphSimLink>("line")
      .data(graphLinks)
      .join("line")
      .attr("stroke", (entry) => entry.type === "concept-link" ? "#FF3D00" : "#262626")
      .attr("stroke-width", (entry) => entry.type === "concept-link" ? 1 : 1.5)
      .attr("stroke-opacity", (entry) => entry.type === "concept-link" ? 0.5 : 1)
      .attr("stroke-dasharray", (entry) => entry.type === "concept-link" ? "2 4" : "0");

    const nodeGroups = root
      .append("g")
      .selectAll<SVGGElement, GraphSimNode>("g.node")
      .data(graphNodes)
      .join("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, entry: GraphSimNode) => {
        setTooltip({ node: entry, x: event.clientX, y: event.clientY });
      })
      .on("mousemove", (event: MouseEvent, entry: GraphSimNode) => {
        setTooltip({ node: entry, x: event.clientX, y: event.clientY });
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (_event: MouseEvent, entry: GraphSimNode) => {
        setSelectedNodeId(entry.id);
      });

    nodeGroups.each((entry, index, elements) => {
      const group = d3.select(elements[index]);
      const size = getNodeSize(entry);
      if (entry.type === "note") {
        group.append("rect").attr("class", "node-shape")
          .attr("x", -size * 1.3).attr("y", -size * 0.76)
          .attr("width", size * 2.6).attr("height", size * 1.52);
      } else if (entry.type === "concept") {
        group.append("rect").attr("class", "node-shape")
          .attr("x", -size).attr("y", -size)
          .attr("width", size * 2).attr("height", size * 2);
      } else {
        group.append("path").attr("class", "node-shape").attr("d", diamondPath(size));
      }
    });

    nodeGroups.selectAll<SVGElement, GraphSimNode>(".node-shape")
      .attr("fill", (entry) => colorScale(entry.mastery))
      .attr("stroke", "#0A0A0A")
      .attr("stroke-width", 2);

    nodeGroups.append("text")
      .attr("class", "node-label")
      .attr("font-size", "10")
      .attr("font-weight", "700")
      .attr("letter-spacing", "0.1em")
      .attr("fill", "#FAFAFA")
      .attr("text-anchor", "middle")
      .style("pointer-events", "none")
      .text((entry) => entry.label.length > 20 ? `${entry.label.slice(0, 17)}...` : entry.label);

    const simulation = d3
      .forceSimulation(graphNodes)
      .force("link",
        d3.forceLink<GraphSimNode, GraphSimLink>(graphLinks)
          .id((entry) => entry.id)
          .distance((entry) => {
            if (entry.type === "contains") return 80;
            if (entry.type === "generated" || entry.type === "practiced") return 60;
            return 160;
          })
          .strength((entry) => {
            if (entry.type === "contains") return 0.8;
            if (entry.type === "generated" || entry.type === "practiced") return 0.9;
            return 0.3;
          }),
      )
      .force("charge",
        d3.forceManyBody<GraphSimNode>().strength((entry) => {
          if (entry.type === "note") return -500;
          if (entry.type === "concept") return -200;
          return -300;
        }),
      )
      .force("collide",
        d3.forceCollide<GraphSimNode>()
          .radius((entry) => {
            const size = getNodeSize(entry);
            return entry.type === "note" ? size * 1.6 : size + 10;
          })
          .iterations(1),
      )
      .force("x",
        d3.forceX<GraphSimNode>((entry) => anchorForNode(entry).x)
          .strength((entry) => {
            if (entry.type === "note") return 0.2;
            if (entry.type === "concept") return 0.1;
            return 0.15;
          }),
      )
      .force("y",
        d3.forceY<GraphSimNode>((entry) => anchorForNode(entry).y)
          .strength((entry) => {
            if (entry.type === "note") return 0.2;
            if (entry.type === "concept") return 0.1;
            return 0.15;
          }),
      )
      .force("center", d3.forceCenter(viewport.width / 2, viewport.height / 2));

    const drag = d3.drag<SVGGElement, GraphSimNode>()
      .on("start", (event, entry) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        entry.fx = entry.x; entry.fy = entry.y;
      })
      .on("drag", (event, entry) => { entry.fx = event.x; entry.fy = event.y; })
      .on("end", (event, entry) => {
        if (!event.active) simulation.alphaTarget(0);
        entry.fx = null; entry.fy = null;
      });

    nodeGroups.call(drag);

    const getNodeX = (value: string | number | GraphSimNode) =>
      typeof value === "object" && value !== null ? value.x || 0 : 0;
    const getNodeY = (value: string | number | GraphSimNode) =>
      typeof value === "object" && value !== null ? value.y || 0 : 0;

    simulation.on("tick", () => {
      link
        .attr("x1", (entry) => getNodeX(entry.source))
        .attr("y1", (entry) => getNodeY(entry.source))
        .attr("x2", (entry) => getNodeX(entry.target))
        .attr("y2", (entry) => getNodeY(entry.target));

      nodeGroups.attr("transform", (entry) => `translate(${entry.x || 0},${entry.y || 0})`);

      nodeGroups.selectAll<SVGElement, GraphSimNode>(".node-shape")
        .attr("stroke", (entry) => entry.id === selectedNodeId ? "#FF3D00" : "#0A0A0A")
        .attr("stroke-width", (entry) => entry.id === selectedNodeId ? 3 : 2);

      nodeGroups.selectAll<SVGTextElement, GraphSimNode>(".node-label")
        .attr("y", (entry) => getLabelOffset(entry))
        .attr("fill", (entry) => entry.id === selectedNodeId ? "#FF3D00" : "#FAFAFA");
    });

    simulationRef.current = simulation;

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3.2])
      .on("zoom", (event) => { root.attr("transform", event.transform.toString()); });

    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    return () => { simulation.stop(); svg.on(".zoom", null); };
  }, [setSelectedNodeId, selectedNodeId, viewport.height, viewport.width, visibleEdges, visibleNodes]);

  const zoomBy = (factor: number) => {
    const svgElement = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svgElement || !zoomBehavior) return;
    d3.select(svgElement).transition().duration(180).call(zoomBehavior.scaleBy, factor);
  };

  const resetView = () => {
    const svgElement = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svgElement || !zoomBehavior) return;
    d3.select(svgElement).transition().duration(220).call(zoomBehavior.transform, d3.zoomIdentity);
  };

  const metaView = meta || defaultMeta();

  // ── Inspector content (shared between panel and sheet) ──

  const InspectorContent = () => (
    <AnimatePresence mode="popLayout">
      {selectedNode ? (
        <motion.div
          key={selectedNode.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-8 sm:space-y-12"
        >
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center border-b border-[#262626] pb-4">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#0A0A0A] bg-[#FAFAFA] px-3 py-1 uppercase">
                {getNodeTypeLabel(selectedNode.type)}
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tighter leading-none break-words uppercase text-[#FAFAFA]">
              {selectedNode.label}
            </h3>
            <p className="text-xs font-bold tracking-widest text-[#737373] uppercase">
              SUBJECT: {selectedNode.subject}
            </p>
          </div>

          {selectedNode.type === "note" && (
            <div className="space-y-8 sm:space-y-10">
              {selectedNoteResources.length > 0 && (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block border-b border-[#262626] pb-2">
                    RESOURCES
                  </span>
                  <div className="border-t border-l border-[#262626]">
                    {selectedNoteResources.map(({ node }) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className="w-full text-left group flex items-center justify-between p-3 sm:p-4 border-b border-r border-[#262626] bg-[#0A0A0A] hover:bg-[#FAFAFA] transition-colors"
                      >
                        <span className="text-xs font-bold tracking-wider text-[#FAFAFA] group-hover:text-[#0A0A0A] transition-colors line-clamp-1 uppercase">
                          {node.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedNoteConcepts.length > 0 && (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block border-b border-[#262626] pb-2">
                    CONCEPTS
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedNoteConcepts.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className="px-3 sm:px-4 py-2 border border-[#262626] bg-[#0A0A0A] text-[10px] font-bold tracking-widest text-[#FAFAFA] hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors uppercase"
                      >
                        {node.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedNode.type === "concept" && (
            <div className="space-y-8 sm:space-y-10">
              {selectedConceptNotes.length > 0 && (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block border-b border-[#262626] pb-2">
                    ORIGIN NOTES
                  </span>
                  <div className="border-t border-l border-[#262626]">
                    {selectedConceptNotes.map((noteNode) => (
                      <button
                        key={noteNode.id}
                        onClick={() => setSelectedNodeId(noteNode.id)}
                        className="w-full text-left group flex flex-col p-3 sm:p-4 border-b border-r border-[#262626] bg-[#0A0A0A] hover:bg-[#FAFAFA] transition-colors"
                      >
                        <span className="text-xs font-bold tracking-wider text-[#FAFAFA] group-hover:text-[#0A0A0A] transition-colors line-clamp-2 uppercase">
                          {noteNode.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedConceptLinks.length > 0 && (
                <div className="space-y-4">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block border-b border-[#262626] pb-2">
                    RELATED CONCEPTS
                  </span>
                  <div className="border-t border-l border-[#262626]">
                    {selectedConceptLinks.map(({ neighbor }) => (
                      <button
                        key={neighbor.id}
                        onClick={() => setSelectedNodeId(neighbor.id)}
                        className="w-full text-left group p-3 sm:p-4 border-b border-r border-[#262626] bg-[#0A0A0A] hover:bg-[#FAFAFA] transition-colors"
                      >
                        <div className="text-xs font-bold tracking-wider text-[#FAFAFA] group-hover:text-[#0A0A0A] uppercase transition-colors">
                          {neighbor.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4">
                <SecondaryButton
                  onClick={() => navigate(`/tutor?topic=${encodeURIComponent(selectedNode.label)}`)}
                  className="w-full"
                >
                  STUDY CONCEPT <ArrowRight className="w-4 h-4 ml-1" />
                </SecondaryButton>
              </div>
            </div>
          )}

          {isResourceType(selectedNode.type) && (
            <div className="space-y-8 sm:space-y-10">
              <div className="space-y-4">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block border-b border-[#262626] pb-2">
                  ORIGIN NOTE
                </span>
                {selectedResourceParent ? (
                  <button
                    onClick={() => setSelectedNodeId(selectedResourceParent.id)}
                    className="w-full text-left group p-3 sm:p-4 border border-[#262626] bg-[#0A0A0A] hover:bg-[#FAFAFA] transition-colors"
                  >
                    <div className="text-xs font-bold tracking-wider text-[#FAFAFA] group-hover:text-[#0A0A0A] line-clamp-2 uppercase transition-colors">
                      {selectedResourceParent.label}
                    </div>
                  </button>
                ) : (
                  <div className="border border-[#262626] p-4 text-center">
                    <p className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">ORPHANED</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:gap-4">
                <PrimaryButton
                  onClick={() => navigate(`/tutor?topic=${encodeURIComponent(selectedNode.subject)}`)}
                  className="w-full justify-center"
                >
                  TUTOR
                </PrimaryButton>
                <SecondaryButton onClick={() => navigate("/quiz")} className="w-full">
                  QUIZ
                </SecondaryButton>
              </div>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center text-center p-8 sm:p-16 border border-[#262626] bg-[#0A0A0A] mt-8"
        >
          <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#737373]">WAITING.</h3>
          <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase">
            SELECT A NODE TO INSPECT
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <PageWrapper>
      <RateLimitBanner remaining={remaining} limit={limit} resetTime={resetTime} showAddKeyPrompt={true} />

      <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] selection:bg-[#FF3D00] selection:text-white pb-8 sm:pb-16 md:pb-32 font-sans">

        {/* NOISE TEXTURE */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.015] mix-blend-overlay z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />

        {/* ── HERO SECTION ── */}
        <div className="relative pt-8 sm:pt-16 md:pt-32 pb-6 sm:pb-10 md:pb-16 px-4 sm:px-8 md:px-16 border-b border-[#262626]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-12"
          >
            <div>
              {/* ↓ heading scales from text-4xl on mobile */}
              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-6xl md:text-8xl lg:text-[9rem] font-bold tracking-tighter leading-none uppercase"
              >
                KNOWLEDGE
                <br />
                <span className="text-[#737373]">GRAPH.</span>
              </motion.h1>
              <motion.div variants={fadeUp} className="mt-4 sm:mt-6 flex items-center gap-4 sm:gap-6">
                <div className="h-1 w-8 sm:w-12 bg-[#FF3D00]" />
                <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase">
                  <span className="hidden sm:inline">INTERACTIVE ONTOLOGY VISUALIZER</span>
                  <span className="sm:hidden">ONTOLOGY MAP</span>
                </p>
              </motion.div>
            </div>

            {/* ↓ controls row: stacks on mobile, column from md */}
            <motion.div variants={fadeUp} className="flex flex-row sm:flex-col gap-3 sm:gap-4 sm:min-w-[200px]">
              <PrimaryButton
                onClick={() => fetchGraph({ useAi: true, force: true })}
                className="flex-1 sm:flex-none justify-center sm:justify-start"
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">SYNC ONTOLOGY</span>
                <span className="sm:hidden">SYNC</span>
              </PrimaryButton>
              {/* ↓ zoom controls bar */}
              <div className="flex border border-[#262626] bg-[#0A0A0A] flex-1 sm:flex-none sm:w-full">
                <GhostButton onClick={() => zoomBy(0.85)} className="flex-1 justify-center">
                  <ZoomOut className="w-4 h-4" />
                </GhostButton>
                <div className="w-px bg-[#262626]" />
                <GhostButton onClick={() => zoomBy(1.15)} className="flex-1 justify-center">
                  <ZoomIn className="w-4 h-4" />
                </GhostButton>
                <div className="w-px bg-[#262626]" />
                <GhostButton onClick={resetView} className="flex-1 justify-center">
                  <span className="hidden sm:inline">RESET</span>
                  <Target className="w-4 h-4 sm:hidden" />
                </GhostButton>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-16 py-6 sm:py-10 md:py-16">

          {/* STATS & SEARCH */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-6 sm:gap-8 md:gap-12 mb-6 sm:mb-10 md:mb-16"
          >
            {/* Search bar */}
            <div className="flex items-center gap-3 sm:gap-4 border-b border-[#262626] pb-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 sm:w-5 sm:h-5 text-[#737373]" />
                </div>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="QUERY ONTOLOGY..."
                  className="w-full bg-transparent border-none pl-8 sm:pl-10 text-sm font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none uppercase rounded-none"
                />
              </div>
              <div className="hidden sm:block h-[1px] w-24 bg-[#262626]" />
              <span className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase whitespace-nowrap">
                {metaView.nodeCount.toString().padStart(2, "0")}
                <span className="hidden sm:inline"> NODES</span>
              </span>
            </div>

            {/* Filter & Stats grid */}
            {/* ↓ 1-col mobile → 2-col sm → 4-col md */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-[#262626] bg-[#0A0A0A]">

              {/* Nodes / Edges stat */}
              <div className="p-4 sm:p-6 md:p-8 border-b border-r border-[#262626] flex flex-col justify-between group cursor-pointer relative overflow-hidden">
                <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 sm:mb-4">
                    NODES / EDGES
                  </span>
                  <div>
                    {/* ↓ number scales from text-2xl */}
                    <span className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">{metaView.nodeCount}</span>
                    <span className="text-base sm:text-xl text-[#737373] font-bold mx-1 sm:mx-2">/</span>
                    <span className="text-base sm:text-xl text-[#737373] font-bold">{metaView.edgeCount}</span>
                  </div>
                </div>
              </div>

              {/* Node types stat */}
              <div className="p-4 sm:p-6 md:p-8 border-b border-r border-[#262626] flex flex-col justify-between group cursor-pointer relative overflow-hidden">
                <div className="absolute inset-0 bg-[#FAFAFA] origin-bottom scale-y-0 transition-transform duration-500 ease-[0.25,0,0,1] group-hover:scale-y-100 z-0" />
                <div className="relative z-10 flex-1 flex flex-col transition-colors duration-500 group-hover:text-[#0A0A0A]">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 sm:mb-4">
                    NODE TYPES
                  </span>
                  <span className="text-base sm:text-xl font-bold tracking-tight">
                    {metaView.nodeTypes.note} N / {metaView.nodeTypes.concept} C
                  </span>
                </div>
              </div>

              {/* Filters — full width on mobile (col-span-2), 2-col from md */}
              <div className="p-4 sm:p-6 md:p-8 border-b border-r border-[#262626] col-span-2 md:col-span-2 flex flex-col gap-3 sm:gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
                    STATE FILTERS
                  </span>
                  <div className="flex gap-1 sm:gap-2">
                    <GhostButton active={showWeakOnly} onClick={() => setShowWeakOnly(!showWeakOnly)} className="px-2 sm:px-4">
                      <Target className="w-3 h-3 sm:mr-2" />
                      <span className="hidden sm:inline">WEAK</span>
                    </GhostButton>
                    <GhostButton onClick={clearFilters} className="px-2 sm:px-4">
                      <Filter className="w-3 h-3 sm:mr-2" />
                      <span className="hidden sm:inline">CLEAR</span>
                    </GhostButton>
                  </div>
                </div>
                {/* ↓ subject chips wrap naturally */}
                <div className="flex flex-wrap gap-2">
                  {subjects.map((subject) => {
                    const active = subjectFilters.includes(subject);
                    return (
                      <button
                        key={subject}
                        onClick={() => toggleSubjectFilter(subject)}
                        className={cn(
                          "px-3 sm:px-4 py-1 sm:py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase border transition-colors",
                          active
                            ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                            : "border-[#262626] text-[#737373] hover:text-[#FAFAFA] hover:border-[#FAFAFA]"
                        )}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── GRAPH + INSPECTOR ── */}
          <motion.div
            variants={fadeUp}
            // ↓ stacks on mobile, side-by-side from xl
            className="grid grid-cols-1 xl:grid-cols-[1fr_380px] border border-[#262626] bg-[#0A0A0A]"
          >
            {/* GRAPH VIEWPORT */}
            <div className="relative border-b xl:border-b-0 xl:border-r border-[#262626] bg-black flex flex-col">
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-16 bg-[#0A0A0A] min-h-[300px] sm:min-h-[400px]">
                  <div className="w-full max-w-lg h-48 sm:h-64 border border-[#262626] bg-[#0A0A0A] animate-pulse" />
                </div>
              ) : error ? (
                <div className="flex-1 border border-[#FF3D00] p-8 sm:p-16 flex flex-col items-center justify-center text-center bg-[#FF3D00]/5 min-h-[300px]">
                  <p className="text-base sm:text-lg font-bold tracking-tight text-[#FF3D00] uppercase mb-2">ERROR</p>
                  <p className="text-xs font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">{error}</p>
                  <PrimaryButton onClick={() => fetchGraph({ force: true })}>
                    RETRY <ArrowRight className="w-4 h-4 ml-1" />
                  </PrimaryButton>
                </div>
              ) : isEmpty ? (
                <div className="flex-1 p-8 sm:p-16 flex flex-col items-center text-center justify-center bg-[#0A0A0A] min-h-[300px]">
                  <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">VOID.</h3>
                  <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8 max-w-sm">
                    NO GRAPH DATA CURRENTLY AVAILABLE. INITIATE STUDY SESSIONS.
                  </p>
                  <PrimaryButton onClick={() => fetchGraph({ force: true })}>
                    REFRESH <ArrowRight className="w-4 h-4 ml-1" />
                  </PrimaryButton>
                </div>
              ) : visibleNodes.length === 0 ? (
                <div className="flex-1 p-8 sm:p-16 flex flex-col items-center text-center justify-center bg-[#0A0A0A] min-h-[300px]">
                  <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">VOID.</h3>
                  <p className="text-xs sm:text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
                    ZERO NODES MATCHING CURRENT FILTERS.
                  </p>
                  <SecondaryButton onClick={clearFilters}>RESET FILTERS</SecondaryButton>
                </div>
              ) : (
                <div ref={wrapperRef} className="flex-1 w-full relative overflow-hidden group" style={{ minHeight: "360px" }}>
                  <svg
                    ref={svgRef}
                    width={viewport.width}
                    height={viewport.height}
                    className="w-full h-full absolute inset-0 outline-none"
                  />

                  {/* Legend overlay */}
                  <div className="absolute left-3 sm:left-6 bottom-3 sm:bottom-6 border border-[#262626] bg-[#0A0A0A]/90 p-3 sm:p-4">
                    <div className="space-y-2 sm:space-y-3">
                      <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase block">SHAPES</span>
                      {/* ↓ stacks on very small screens, row on sm */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[10px] font-bold tracking-widest text-[#FAFAFA]">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-3 border border-[#FAFAFA] bg-transparent" /> NOTE
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-[#FAFAFA] bg-transparent" /> CONCEPT
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rotate-45 border border-[#FAFAFA] bg-transparent" /> RESOURCE
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ↓ mobile inspector toggle button — shown on <xl when a node is selected */}
                  {selectedNode && (
                    <button
                      onClick={() => setShowInspector(true)}
                      className="xl:hidden absolute right-3 bottom-3 border border-[#FF3D00] bg-[#0A0A0A]/90 px-3 py-2 text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase"
                    >
                      INSPECT ↑
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* INSPECTOR — sidebar on xl, hidden on smaller (replaced by sheet) */}
            <div className="hidden xl:flex flex-col bg-[#0A0A0A] h-full xl:max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="p-6 sm:p-8 border-b border-[#262626] sticky top-0 bg-[#0A0A0A] z-10 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">INSPECTOR</span>
                {selectedNode && (
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                    {selectedNode.mastery}% MST
                  </span>
                )}
              </div>
              <div className="p-6 sm:p-8">
                <InspectorContent />
              </div>
            </div>
          </motion.div>

          {/* ↓ MOBILE INSPECTOR — bottom sheet on <xl */}
          <AnimatePresence>
            {showInspector && selectedNode && (
              <>
                {/* backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="xl:hidden fixed inset-0 z-40 bg-[#0A0A0A]/80 backdrop-blur-sm"
                  onClick={() => setShowInspector(false)}
                />
                {/* sheet */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.3, ease: easing as any }}
                  className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A] border-t border-[#262626] rounded-t-2xl max-h-[80vh] overflow-y-auto"
                >
                  {/* Drag handle */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-[#262626] rounded-full" />
                  </div>

                  {/* Header */}
                  <div className="px-5 py-4 border-b border-[#262626] flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-10">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">INSPECTOR</span>
                    <div className="flex items-center gap-4">
                      {selectedNode && (
                        <span className="text-[10px] font-bold tracking-[0.2em] text-[#FF3D00] uppercase">
                          {selectedNode.mastery}% MST
                        </span>
                      )}
                      <button
                        onClick={() => setShowInspector(false)}
                        className="text-[10px] font-bold tracking-[0.2em] text-[#737373] hover:text-[#FAFAFA] uppercase transition-colors"
                      >
                        CLOSE ✕
                      </button>
                    </div>
                  </div>

                  <div className="p-5 pb-10">
                    <InspectorContent />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* TOOLTIP */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 border border-[#262626] bg-[#0A0A0A] p-3 sm:p-4 shadow-none"
          style={{
            left: Math.min(tooltip.x + 16, window.innerWidth - 180),
            top: Math.min(tooltip.y + 16, window.innerHeight - 100),
          }}
        >
          <p className="font-bold text-xs text-[#FAFAFA] tracking-wider mb-2 sm:mb-3 uppercase border-b border-[#262626] pb-2">
            {tooltip.node.label.length > 30 ? `${tooltip.node.label.substring(0, 27)}...` : tooltip.node.label}
          </p>
          <div className="space-y-1 text-[10px] font-bold tracking-widest text-[#737373] uppercase">
            <p>TYPE: {getNodeTypeLabel(tooltip.node.type)}</p>
            <p>SUB: {tooltip.node.subject}</p>
            <p>MST: {tooltip.node.mastery}%</p>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
