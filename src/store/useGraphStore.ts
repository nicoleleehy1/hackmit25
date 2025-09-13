import { create } from "zustand";
import type { GraphData, KGNode, Mode } from "@/types/graph";

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

type GraphState = {
  graph: GraphData;
  mode: Mode;
  pendingSource: string | null;
  highlightIds: Set<string>;

  setMode: (m: Mode) => void;
  setPendingSource: (id: string | null) => void;

  setGraph: (g: GraphData) => void;
  addNode: (node: KGNode) => void;
  addLink: (sourceId: string, targetId: string) => void;
  removeNode: (id: string) => void;
  savePosition: (id: string, x: number, y: number) => void;

  expandNode: (id: string) => void; // mock expansion (Step 1)
  rewireLink: (sourceId: string, targetId: string) => void;

  highlight: (ids: string[]) => void;
  resetViewKey: number; // bump to trigger zoomToFit in component
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

  setMode: (m) => set({ mode: m, pendingSource: m === "connect" ? null : get().pendingSource }),
  setPendingSource: (id) => set({ pendingSource: id }),

  setGraph: (g) => set({ graph: recomputeDegrees(g) }),
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
