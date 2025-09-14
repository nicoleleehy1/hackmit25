/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeObject } from "force-graph";
import { forceCollide } from "d3-force-3d";
import { useGraphStore } from "../store/useGraphStore";
import type { KGNode, KGLink, GraphData } from "../types/graph";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// ---------------------- utils ----------------------
const uid = () =>
  globalThis.crypto && "randomUUID" in globalThis.crypto
    ? (globalThis.crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function toId(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") return String((v as any).id ?? "");
  return String(v);
}

// 🔧 Normalize graph so links always reference node ids (strings), never object refs
function normalizeGraphData(g: GraphData): GraphData {
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

function radialChildren(
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

function drawTextInCircle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  r: number,
  options?: {
    maxLines?: number;
    padding?: number;
    color?: string;
    minPx?: number;
    maxPx?: number;
  }
) {
  const maxLines = options?.maxLines ?? 2;
  const padding = Math.min(options?.padding ?? 2, Math.max(1, r * 0.25));
  const color = options?.color ?? "#ffffff";
  const minPx = options?.minPx ?? 2;
  const maxPx = options?.maxPx ?? 4;

  const maxW = Math.max(1, r * 2 - padding * 2);
  const maxH = Math.max(1, r * 2 - padding * 2);

  const setFont = (px: number) => {
    ctx.font = `${px}px ui-sans-serif, system-ui, -apple-system`;
  };
  const measure = (s: string) => ctx.measureText(s).width;

  const wrapToLines = (s: string, maxWidth: number): string[] => {
    const words = s.split(" ").filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (measure(test) <= maxWidth) cur = test;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let lo = minPx,
    hi = Math.max(minPx, maxPx);
  let best: { fs: number; lines: string[] } | null = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    setFont(mid);
    let lines = wrapToLines(text, maxW);

    if (lines.length > maxLines) {
      const head = lines.slice(0, maxLines - 1);
      const tail = lines.slice(maxLines - 1).join(" ");
      let ell = tail;
      while (measure(ell + "…") > maxW && ell.length > 0)
        ell = ell.slice(0, -1);
      lines = [...head, ell ? ell + "…" : "…"];
    }

    const lineHeight = mid * 1.1;
    const totalH = lines.length * lineHeight;

    if (totalH <= maxH && lines.every((l) => measure(l) <= maxW)) {
      best = { fs: mid, lines };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (!best) {
    setFont(minPx);
    let s = text;
    while (measure(s) > maxW && s.length > 1) s = s.slice(0, -1);
    if (s.length === 0) s = "·";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
    return;
  }

  setFont(best.fs);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = best.fs * 1.1;
  const startY = y - ((best.lines.length - 1) * lineHeight) / 2;
  best.lines.forEach((line, i) =>
    ctx.fillText(line, x, startY + i * lineHeight)
  );
}

// helper: convert a mouse event to graph coords reliably
function eventToGraphXY(fg: any, e: MouseEvent) {
  // use canvas rect to get pixel offset
  const rect = fg?.canvas?.().getBoundingClientRect?.();
  const sx = e.clientX - (rect?.left ?? 0);
  const sy = e.clientY - (rect?.top ?? 0);
  // screen2GraphCoords expects screen px relative to canvas
  return fg.screen2GraphCoords(sx, sy);
}

// ---------------------- component ----------------------
export default function KnowledgeGraph() {
  const {
    graph,
    highlightIds,
    mode,
    pendingSource,
    setPendingSource,
    rewireLink,
    savePosition,
    setGraph,
    resetViewKey,
    addFreeNodeAt,
  } = useGraphStore();

  const fgRef = useRef<any>(null);

  // stack of *normalized* graphs
  type GraphSnapshot = {
    graph: GraphData;
    centerNodeId: string | null;
  };
  const viewStackRef = useRef<GraphSnapshot[]>([]);
  const [stackDepth, setStackDepth] = useState(0);

  const [cooldownTicks, setCooldownTicks] = useState<number | undefined>(0);

  const sanitizedGraph: GraphData = useMemo(() => {
    try {
      return normalizeGraphData(structuredClone(graph));
    } catch {
      // fallback for browsers without structuredClone
      return normalizeGraphData(JSON.parse(JSON.stringify(graph)));
    }
  }, [graph]);

  const [centerNodeId, setCenterNodeId] = useState<string | null>(null);

  useEffect(() => {
    const el = fgRef.current;
    if (!el) return;

    el.d3Force(
      "collide",
      forceCollide()
        .radius(
          (n: KGNode) => (n.radius ?? 4 + Math.log2(1 + (n.degree ?? 0))) + 30
        )
        .strength(1)
    );

    const t = setTimeout(() => {
      try {
        el.zoomToFit(300, 150);
      } catch {}
    }, 60);
    return () => clearTimeout(t);
  }, [sanitizedGraph.nodes.length, sanitizedGraph.links.length, resetViewKey]);

  function buildFocusedGraph(centerNode: KGNode): GraphData {
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

  function preziZoomIntoNode(n: any) {
    const el = fgRef.current;
    if (!el) return;

    viewStackRef.current.push({
      graph: normalizeGraphData(structuredClone(sanitizedGraph)),
      centerNodeId: centerNodeId,
    });
    setStackDepth(viewStackRef.current.length);

    const focused = buildFocusedGraph(n as KGNode);
    setCooldownTicks(60);
    setGraph(focused);

    setTimeout(() => {
      try {
        el.zoomToFit(300, 150);
      } catch {}
      setTimeout(() => setCooldownTicks(0), 800);
    }, 200); // small delay so the graph renders first
  }

  function handleBack() {
    const prev = viewStackRef.current.pop();
    if (!prev) return;

    setStackDepth(viewStackRef.current.length);

    setCooldownTicks(60);

    // ensure prev is normalized (it should already be), but be safe:
    setGraph(normalizeGraphData(prev.graph));

    setCenterNodeId(prev.centerNodeId);

    setTimeout(() => {
      try {
        fgRef.current?.zoomToFit(300, 150);
      } catch {}
      setTimeout(() => setCooldownTicks(0), 800);
    }, 200);
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full bg-white">
      <ForceGraph2D
        ref={fgRef}
        graphData={sanitizedGraph}
        cooldownTicks={mode === "add" ? 0 : cooldownTicks}
        nodeRelSize={6}
        enableNodeDrag
        minZoom={0.3}
        maxZoom={12}
        onBackgroundClick={(e: MouseEvent) => {
          if (mode !== "add") return;
          const el = fgRef.current;
          if (!el) return;

          // Convert screen coords to graph coords
          const { x, y } = el.screen2GraphCoords(e.clientX, e.clientY);
          addFreeNodeAt(x, y);

          // optional: brief cooldown to settle layout (node is pinned anyway)
          // setCooldownTicks(20);
          // setTimeout(() => setCooldownTicks(0), 250);
        }}
        onNodeClick={(n: any) => {
          const el = fgRef.current;
          if (!el) return;

          if (mode === "connect") {
            if (!pendingSource) setPendingSource(String(n.id));
            else {
              rewireLink(pendingSource, String(n.id));
              setPendingSource(null);
            }
            return;
          }

          if (mode === "default") {
            preziZoomIntoNode(n); // keep your zoom behavior in default mode
            setCenterNodeId(String(n.id));
          }
          // In "add" mode, clicking nodes does nothing special.

          if (mode === "add") {
            // allow adding multiple nodes even if clicking on top of a node
            const nx = n.x ?? 0;
            const ny = n.y ?? 0;
            addFreeNodeAt(nx, ny);
            return;
          }
        }}
        onNodeDragEnd={(n: any) => {
          if (typeof n?.x === "number" && typeof n?.y === "number") {
            savePosition(String(n.id), n.x, n.y);
          }
        }}
        nodeCanvasObject={(
          node: NodeObject,
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
          const n = node as unknown as KGNode & { x: number; y: number };
          const degree = (n as any).degree || 0;
          const baseR = 4 + Math.log2(1 + degree);
          const r = baseR * Math.min(globalScale, 3);
          const isHL = n.id != null && highlightIds.has(String(n.id));

          if (isHL) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 1.35, 0, Math.PI * 2);
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = "#ffd54f";
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          if (centerNodeId === String(n.id)) {
            ctx.fillStyle = "#ff6f61";
          } else {
            ctx.fillStyle = (n as any).color || "#7aa2ff";
          }
          ctx.fill();

          const label = (n as any).label || n.title || String(n.id);
          drawTextInCircle(ctx, label, n.x, n.y, r, {
            maxLines: globalScale > 2 ? 10 : 2,
            padding: 6,
            color: "#ffffff",
            maxPx: 6,
            minPx: 4,
          });
        }}
        nodePointerAreaPaint={(
          node: NodeObject,
          color: string,
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
          const n = node as unknown as KGNode & { x: number; y: number };
          const degree = (n as any).degree || 0;
          const baseR = 4 + Math.log2(1 + degree);
          const r = baseR * Math.min(globalScale, 3);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2, false);
          ctx.fill();
        }}
        linkWidth={(l: any) => {
          const sid = String(
            typeof l.source === "object" ? (l.source as any).id : l.source
          );
          const tid = String(
            typeof l.target === "object" ? (l.target as any).id : l.target
          );
          return highlightIds.has(sid) && highlightIds.has(tid) ? 1.6 : 0.6;
        }}
        linkDirectionalParticles={0}
      />

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 text-xs">
        <div className="pointer-events-auto rounded-full bg-black/70 px-3 py-1 text-white">
          Mode: <span className="font-semibold">{mode}</span>
        </div>
        {stackDepth > 0 && (
          <button
            onClick={handleBack}
            className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 font-medium text-gray-800 shadow hover:bg-blue-500 hover:text-white"
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
