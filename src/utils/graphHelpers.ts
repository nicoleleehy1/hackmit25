import type { GraphData, KGNode, KGLink } from "@/types/graph";

export const uid = () =>
  globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function radialChildren(
  center: { x: number; y: number },
  count: number,
  radius = 120
) {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius,
    });
  }
  return out;
}

export function buildFocusedGraph(centerNode: KGNode): GraphData {
    const centerId = String(centerNode.id);
    const center: KGNode = {
      ...centerNode,
      id: centerId,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
      label: centerNode.label || centerNode.title || centerId,
    };

    const N = 8;
    const positions = radialChildren({ x: 0, y: 0 }, N, 160);

    const children: KGNode[] = Array.from({ length: N }, (_, i) => {
      const id = uid();
      const title = `${center.title ?? center.id} • ${i + 1}`;
      return {
        id: String(id),
        title,
        label: title,
        level: (center.level ?? 0) + 1,
        x: positions[i].x,
        y: positions[i].y,
      } as KGNode;
    });

    const links: KGLink[] = children.map((ch) => ({
      id: uid(),
      source: centerId,
      target: String(ch.id),
    }));

    if (children.length > 3) {
      links.push({
        id: uid(),
        source: String(children[0].id),
        target: String(children[2].id),
      });
      links.push({
        id: uid(),
        source: String(children[1].id),
        target: String(children[3].id),
      });
    }

    return normalizeGraphData({ nodes: [center, ...children], links }); // 🔧
  }

  function toId(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") return String((v as any).id ?? "");
  return String(v);
}

export function normalizeGraphData(g: GraphData): GraphData {
    const nodes: KGNode[] = g.nodes.map((n: any) => ({
      ...n,
      id: String(n.id), // keep id type stable
    }));
  
    const nodeIdSet = new Set(nodes.map((n) => String(n.id)));
  
    const links: KGLink[] = g.links
      .map((l: any) => {
        const s = toId(l.source);
        const t = toId(l.target);
        return {
          ...l,
          id: l.id ?? uid(),
          source: s,
          target: t,
        };
      })
      // drop any dangling links defensively
      .filter(
        (l) => nodeIdSet.has(String(l.source)) && nodeIdSet.has(String(l.target))
      );
  
    return { nodes, links };
  }
