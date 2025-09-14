// components/makeStarGraph.ts
export type ServerNode = { id: string; label: string; summary?: string; x?: number; y?: number; fx?: number; fy?: number };
export type ServerEdge = { source: string; target: string; label?: string };
export type ServerGraph = { nodes: ServerNode[]; edges: ServerEdge[] };

/**
 * Build a star graph:
 *  - center node uses the query as label
 *  - surrounding nodes use result titles/snippets
 *  - nodes are positioned in a circle for a clean “hub-and-spoke” look
 */
export function makeStarGraph(query: string, resultTitles: string[]): ServerGraph {
  const centerId = `center:${query}`;
  const center: ServerNode = {
    id: centerId,
    label: query || "Search",
    fx: 0, fy: 0, // fix at center
  };

  const radius = 220;
  const nodes: ServerNode[] = [center];
  const edges: ServerEdge[] = [];

  resultTitles.forEach((title, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, resultTitles.length);
    const id = `res:${i}:${title.slice(0, 50)}`;
    const node: ServerNode = {
      id,
      label: title || `Result ${i + 1}`,
      fx: radius * Math.cos(angle),
      fy: radius * Math.sin(angle),
    };
    nodes.push(node);
    edges.push({ source: centerId, target: id });
  });

  return { nodes, edges };
}
