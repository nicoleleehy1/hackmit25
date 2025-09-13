// src/store/useGraphStore.ts
import { create } from "zustand";

export type Node = {
  id: string;
  label: string;
  summary: string;
};

export type Edge = {
  source: string;
  target: string;
  label: string;
};

export type Graph = {
  nodes: Node[];
  edges: Edge[];
};

export type Source = {
  id: string;     // typically the node id this source relates to
  title: string;
  url: string;
};

type GraphStore = {
  nodes: Node[];
  edges: Edge[];
  sources: Source[];

  setGraph: (graph: Graph) => void;
  setSources: (sources: Source[]) => void;
  setFromResponse: (payload: { graph: Graph; sources?: Source[] }) => void;

  clearGraph: () => void;

  // optional: merge a new graph into the current one (e.g., expand)
  mergeGraph: (patch: Graph) => void;
};

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  sources: [],

  setGraph: (graph) =>
    set({
      nodes: graph.nodes ?? [],
      edges: graph.edges ?? [],
    }),

  setSources: (sources) => set({ sources: sources ?? [] }),

  setFromResponse: ({ graph, sources }) =>
    set({
      nodes: graph?.nodes ?? [],
      edges: graph?.edges ?? [],
      sources: sources ?? [],
    }),

  clearGraph: () => set({ nodes: [], edges: [], sources: [] }),

  mergeGraph: (patch) => {
    const { nodes, edges } = get();

    // Avoid id collisions: if an incoming node id already exists, remap it
    const existingIds = new Set(nodes.map((n) => n.id));
    const idMap = new Map<string, string>();

    const remapId = (oldId: string) => {
      if (!existingIds.has(oldId) && !idMap.has(oldId)) {
        idMap.set(oldId, oldId);
        existingIds.add(oldId);
        return oldId;
      }
      if (idMap.has(oldId)) return idMap.get(oldId)!;

      // generate a new unique id
      let i = 1;
      let candidate = `${oldId}_${i}`;
      while (existingIds.has(candidate)) {
        i++;
        candidate = `${oldId}_${i}`;
      }
      idMap.set(oldId, candidate);
      existingIds.add(candidate);
      return candidate;
    };

    const newNodes = patch.nodes.map((n) => ({
      ...n,
      id: remapId(n.id),
    }));

    const newEdges = patch.edges.map((e) => ({
      ...e,
      source: remapId(e.source),
      target: remapId(e.target),
    }));

    // de-duplicate nodes by id after remapping
    const mergedNodesById = new Map<string, Node>();
    [...nodes, ...newNodes].forEach((n) => mergedNodesById.set(n.id, n));

    // simple edge de-dup (source+target+label)
    const edgeKey = (e: Edge) => `${e.source}|${e.target}|${e.label}`;
    const mergedEdgeMap = new Map<string, Edge>();
    [...edges, ...newEdges].forEach((e) => mergedEdgeMap.set(edgeKey(e), e));

    set({
      nodes: Array.from(mergedNodesById.values()),
      edges: Array.from(mergedEdgeMap.values()),
    });
  },
}));
