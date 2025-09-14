// components/makeStarGraph.ts
export type ServerNode = {
  id: string;
  label: string;
  summary?: string;
  x?: number; y?: number;   // seed positions (not fixed)
  fx?: number; fy?: number; // fixed positions (only used for center)
};
export type ServerEdge = { source: string; target: string; label?: string };
export type ServerGraph = { nodes: ServerNode[]; edges: ServerEdge[] };

/**
 * Build a star graph:
 *  - center is pinned at (0,0)
 *  - surrounding nodes are **not fixed**; we optionally seed x/y so the layout starts in a ring
 */
export function makeStarGraph(query: string, resultTitles: string[]): ServerGraph {
  const centerId = `center:${query}`;
  const center: ServerNode = {
    id: centerId,
    label: query || "Search",
    fx: 0, fy: 0, // ⬅️ pinned center only
  };

  const radius = 220;
  const nodes: ServerNode[] = [center];
  const edges: ServerEdge[] = [];

  resultTitles.forEach((title, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, resultTitles.length);
    const id = `res:${i}`; // short, unique
    nodes.push({
      id,
      label: title || `Result ${i + 1}`,
      // ⬇️ seed positions only; NO fx/fy so they can move
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
    edges.push({ source: centerId, target: id });
  });

  return { nodes, edges };
}

/**
 * Attach a non-fixed orbit around any node.
 * - children get only x/y seeds (relative ring), NOT fx/fy
 * - if you don't know the parent's live position, we can seed around (0,0);
 *   ForceGraph will still relax them nicely.
 */
export function makeOrbitGraph(
  parentId: string,
  _parentLabel: string,
  childTitles: string[],
  opts?: { radius?: number; parentX?: number; parentY?: number }
): ServerGraph {
  const radius = opts?.radius ?? 160;
  const px = opts?.parentX ?? 0;
  const py = opts?.parentY ?? 0;

  const nodes: ServerNode[] = [];
  const edges: ServerEdge[] = [];

  childTitles.forEach((title, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, childTitles.length);
    const id = `res:${parentId}:${i}`;
    nodes.push({
      id,
      label: title || `Result ${i + 1}`,
      // ⬇️ seed around the parent, but DO NOT fix
      x: px + radius * Math.cos(angle),
      y: py + radius * Math.sin(angle),
    });
    edges.push({ source: parentId, target: id });
  });

  return { nodes, edges };
}
