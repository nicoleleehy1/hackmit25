/* eslint-disable @typescript-eslint/no-explicit-any */

import { create } from "zustand";
import type { GraphData, KGNode, Mode } from "@/types/graph";

// Backend payload types (what /api/graph/search returns)
type ServerNode = { id: string; label: string; summary?: string };
type ServerEdge = { source: string; target: string; label?: string };
type ServerGraph = { nodes: ServerNode[]; edges: ServerEdge[] };

export type Source = { id: string; title: string; url: string };

const uid = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function recomputeDegrees(g: GraphData): GraphData {
  const deg = new Map<string, number>();
  for (const n of g.nodes) deg.set(n.id, 0);
  for (const e of g.links) {
    deg.set(e.source, (deg.get(e.source) || 0) + 1);
    deg.set(e.target, (deg.get(e.target) || 0) + 1);
  }
  return {
    nodes: g.nodes.map(n => ({ ...n, degree: deg.get(n.id) || 0 })),
    links: g.links
  };
}

function distinctColor(i: number) {
  // pleasant color wheel step
  const hue = (i * 137.508) % 360;
  return `hsl(${hue} 65% 60%)`;
}

function mapServerGraphToClient(g: ServerGraph): GraphData {
  // Map server nodes to your KGNode shape
  const clientNodes: KGNode[] = g.nodes.map((n, i) => {
    const node: KGNode = {
      id: n.id,
      title: n.label,
      label: n.label,
      level: 1,
      color: distinctColor(i),
    } as any;
    // keep summary (even if KGNode type doesn't declare it)
    (node as any).summary = n.summary ?? "";
    return node;
  });

  const clientLinks = g.edges.map((e) => ({
    id: uid(),
    source: e.source,
    target: e.target,
  }));

  // If your server already includes a root, great; otherwise ensure at least one node
  return { nodes: clientNodes, links: clientLinks };
}

type GraphState = {
  graph: GraphData;
  mode: Mode;
  pendingSource: string | null;
  highlightIds: Set<string>;
  sources: Source[];

  setMode: (m: Mode) => void;
  setPendingSource: (id: string | null) => void;

  setGraph: (g: GraphData) => void;

  setFromResponse: (payload: {
    graph: ServerGraph;
    sources?: Source[];
  }) => void;

  addNode: (node: KGNode) => void;
  addLink: (sourceId: string, targetId: string) => void;
  removeNode: (id: string) => void;
  savePosition: (id: string, x: number, y: number) => void;

  expandNode: (id: string) => void;
  rewireLink: (sourceId: string, targetId: string) => void;

  addFreeNodeAt: (x: number, y: number) => void;

  highlight: (ids: string[]) => void;
  resetViewKey: number;
  bumpReset: () => void;
};

const initial: GraphData = {
  nodes: [
    {
      id: "root", title: "Your Topic", label: "Your Topic", level: 0, color: distinctColor(0),
      radius: 0
    }
  ],
  links: []
};

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: initial,
  mode: "default",
  pendingSource: null,
  highlightIds: new Set(),
  resetViewKey: 0,
  sources: [], // ✅ NEW

  setMode: (m) => set({ mode: m, pendingSource: m === "connect" ? null : get().pendingSource }),
  setPendingSource: (id) => set({ pendingSource: id }),

  setGraph: (g) => set({ graph: recomputeDegrees(g) }),

  // ✅ NEW: accept backend { graph:{nodes,edges}, sources }
  setFromResponse: ({ graph, sources }) =>
    set(s => {
      const mapped = mapServerGraphToClient(graph);
      return {
        graph: recomputeDegrees(mapped),
        sources: sources ?? s.sources,
      };
    }),

  addNode: (node) => set(s => {
    const g = { ...s.graph, nodes: [...s.graph.nodes, node] };
    return { graph: recomputeDegrees(g) };
  }),

  addLink: (sourceId, targetId) => set(s => {
    if (sourceId === targetId) return s;
    const exists = s.graph.links.some(l =>
      (l.source === sourceId && l.target === targetId) ||
      (l.source === targetId && l.target === sourceId));
    if (exists) return s;
    const g = { ...s.graph, links: [...s.graph.links, { id: uid(), source: sourceId, target: targetId }] };
    return { graph: recomputeDegrees(g) };
  }),

  removeNode: (id) => set(s => {
    const g: GraphData = {
      nodes: s.graph.nodes.filter(n => n.id !== id),
      links: s.graph.links.filter(l => l.source !== id && l.target !== id)
    };
    return { graph: recomputeDegrees(g) };
  }),
  addFreeNodeAt: (x, y) => set((s) => {
    const idx = s.graph.nodes.length;
    const id = uid();
    const title = `Node ${idx + 1}`;
    const node: KGNode = {
      id,
      title,
      label: title,
      level: 0,
      color: distinctColor(idx),
      radius: 0,
      x, y,
      fx: x, fy: y, // pin so it stays where you clicked
    };
    const g: GraphData = {
      nodes: [...s.graph.nodes, node],
      links: s.graph.links, // no links — independent
    };
    return { graph: recomputeDegrees(g) };
  }),
  savePosition: (id, x, y) => set((s) => {
    const node = s.graph.nodes.find(n => n.id === id);
    if (node) {
      // mutate in place so links keep referring to the same object
      (node as any).x = x;
      (node as any).y = y;
      (node as any).fx = x;  // pin so it stays where you left it
      (node as any).fy = y;
    }
    // return the same graph reference; react-force-graph reads the mutated objects
    return { graph: s.graph };
  }),

  rewireLink: (sourceId, targetId) => {
    get().addLink(sourceId, targetId);
  },

  highlight: (ids) => set({ highlightIds: new Set(ids) }),
  bumpReset: () => set(s => ({ resetViewKey: s.resetViewKey + 1 })),

  // Step 1: local mock expansion (we'll replace with API later)
  expandNode: (id) => set(s => {
    const node = s.graph.nodes.find(n => n.id === id);
    if (!node || node.expanded) return s;

    const level = (node.level ?? 0) + 1;
    const count = 8; // spawn per click
    const baseIdx = s.graph.nodes.length;

    const newNodes: KGNode[] = Array.from({ length: count }, (_, i) => {
      const nid = uid();
      const t = `${node.title} • ${i + 1}`;
      return {
        id: nid,
        title: t,
        label: t,
        level,
        color: distinctColor(baseIdx + i),
        radius: 0, // Add default radius value
      };
    });

    // connect parent -> each child
    const newLinks = newNodes.map(ch => ({ id: uid(), source: node.id, target: ch.id }));

    // a couple of sibling links to hint structure
    if (newNodes.length > 2) {
      newLinks.push({ id: uid(), source: newNodes[0].id, target: newNodes[2].id });
      newLinks.push({ id: uid(), source: newNodes[1].id, target: newNodes[3].id });
    }

    const g: GraphData = {
      nodes: s.graph.nodes.map(n => n.id === id ? { ...n, expanded: true } : n).concat(newNodes),
      links: s.graph.links.concat(newLinks)
    };

    return { graph: recomputeDegrees(g) };
  }),
}));
