"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { NodeObject } from "force-graph";
import { forceCollide } from "d3-force-3d";
import { useGraphStore } from "../store/useGraphStore"; // adjust path if different
import type { KGNode, KGLink, GraphData } from "../types/graph"; // adjust path if different

// Dynamically import the 2D renderer to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// simple uid for demo
const uid = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? (globalThis.crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// helper: radial placement for initial positions
function radialChildren(center: { x: number; y: number }, count: number, radius = 120) {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return out;
}

// Draw text inside a circle, auto-fitting font size and wrapping up to 2 lines.
// Draw text inside a circle, auto-fitting with a tiny fallback.
function drawTextInCircle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  r: number,
  options?: { maxLines?: number; padding?: number; color?: string; minPx?: number; maxPx?: number }
) {
  const maxLines = options?.maxLines ?? 2;
  const padding  = Math.min(options?.padding ?? 2, Math.max(1, r * 0.25)); // 🔹 smaller, radius-aware padding
  const color    = options?.color ?? "#ffffff";
  const minPx    = options?.minPx ?? 2;  // 🔹 allow very tiny fonts
  const maxPx    = options?.maxPx ?? 4;  // 🔹 cap tiny (you asked for 2–4px)

  // available width/height inside the circle
  const maxW = Math.max(1, (r * 2) - padding * 2);
  const maxH = Math.max(1, (r * 2) - padding * 2);

  const setFont = (px: number) => { ctx.font = `${px}px ui-sans-serif, system-ui, -apple-system`; };
  const measure = (s: string) => ctx.measureText(s).width;

  const wrapToLines = (s: string, maxWidth: number): string[] => {
    const words = s.split(" ").filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (measure(test) <= maxWidth) cur = test;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // Binary search for best font size between minPx..maxPx
  let lo = minPx, hi = Math.max(minPx, maxPx);
  let best: { fs: number; lines: string[] } | null = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    setFont(mid);
    let lines = wrapToLines(text, maxW);

    // enforce line limit with ellipsis
    if (lines.length > maxLines) {
      const head = lines.slice(0, maxLines - 1);
      const tail = lines.slice(maxLines - 1).join(" ");
      let ell = tail;
      while (measure(ell + "…") > maxW && ell.length > 0) ell = ell.slice(0, -1);
      lines = [...head, ell ? ell + "…" : "…"];
    }

    const lineHeight = mid * 1.1;
    const totalH = lines.length * lineHeight;

    if (totalH <= maxH && lines.every(l => measure(l) <= maxW)) {
      best = { fs: mid, lines };
      lo = mid + 1; // try bigger within tiny range
    } else {
      hi = mid - 1;
    }
  }

  // Fallback: force a tiny single-line draw that *always* shows something
  if (!best) {
    setFont(minPx);
    let s = text;
    while (measure(s) > maxW && s.length > 1) s = s.slice(0, -1);
    if (s.length === 0) s = "·"; // dot fallback if it's really cramped
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
    return;
  }

  // Draw best-fit lines
  setFont(best.fs);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = best.fs * 1.1;
  const startY = y - ((best.lines.length - 1) * lineHeight) / 2;
  best.lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
}


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
  } = useGraphStore();

  const fgRef = useRef<any>(null);

  // Prezi-like navigation stack: store previous graphs here
  const viewStackRef = useRef<GraphData[]>([]);
  const [stackDepth, setStackDepth] = useState(0);

  // Allow force simulation temporarily when we swap graphs
  const [cooldownTicks, setCooldownTicks] = useState<number | undefined>(0);

  useEffect(() => {
    const el = fgRef.current;
    if (!el) return;

    el.d3Force(
    "collide",
    forceCollide<GraphNode>()
      .radius((n) => (n.radius ?? 4 + Math.log2(1 + (n.degree ?? 0))) + 30) // add extra padding
      .strength(1)
  );

    const t = setTimeout(() => {
      try { el.zoomToFit(400, 50); } catch {}
    }, 60);
    return () => clearTimeout(t);
  }, [graph.nodes.length, graph.links.length, resetViewKey]);

  function buildFocusedGraph(centerNode: KGNode): GraphData {
    const center: KGNode = {
      ...centerNode,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
      label: centerNode.label || centerNode.title || String(centerNode.id),
    };

    const N = 8;
    const positions = radialChildren({ x: 0, y: 0 }, N, 160);

    const children: KGNode[] = Array.from({ length: N }, (_, i) => {
      const id = uid();
      const title = `${center.title ?? center.id} • ${i + 1}`;
      return {
        id,
        title,
        label: title,
        level: (center.level ?? 0) + 1,
        x: positions[i].x,
        y: positions[i].y,
      } as KGNode;
    });

    const links: KGLink[] = [
      ...children.map((ch) => ({ id: uid(), source: String(center.id), target: ch.id })),
    ];
    if (children.length > 3) {
      links.push({ id: uid(), source: children[0].id, target: children[2].id });
      links.push({ id: uid(), source: children[1].id, target: children[3].id });
    }

    return { nodes: [center, ...children], links };
  }

  function preziZoomIntoNode(n: any) {
    const el = fgRef.current;
    if (el && typeof n?.x === "number" && typeof n?.y === "number") {
      el.centerAt(n.x, n.y, 400);
      el.zoom(12, 400);
    }

    setTimeout(() => {
      viewStackRef.current.push(structuredClone(graph));
      setStackDepth(viewStackRef.current.length);

      const focused = buildFocusedGraph(n as KGNode);

      setCooldownTicks(60);
      setGraph(focused);

      setTimeout(() => {
        const el2 = fgRef.current;
        try {
          if (el2) {
            el2.centerAt(0, 0, 400);
            el2.zoom(4, 400);
          }
        } catch {}
        setTimeout(() => setCooldownTicks(0), 1200);
      }, 100);
    }, 420);
  }

  function handleBack() {
    const prev = viewStackRef.current.pop();
    if (!prev) return;
    setStackDepth(viewStackRef.current.length);
    setCooldownTicks(60);
    setGraph(prev);
    setTimeout(() => {
      try { fgRef.current?.zoomToFit(400, 50); } catch {}
      setTimeout(() => setCooldownTicks(0), 800);
    }, 100);
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full bg-white">
      <ForceGraph2D
        ref={fgRef}
        graphData={graph}
        cooldownTicks={cooldownTicks}
        nodeRelSize={6}
        enableNodeDrag
        minZoom={0.3}
        maxZoom={12}
        onNodeClick={(n: any) => {
          const el = fgRef.current;
          if (!el) return;

          if (mode === "connect") {
            if (!pendingSource) setPendingSource(String(n.id));
            else {
              rewireLink(pendingSource, String(n.id));
              setPendingSource(null);
            }
          } else {
            preziZoomIntoNode(n);
          }
        }}
        onNodeDragEnd={(n: any) => {
          if (typeof n?.x === "number" && typeof n?.y === "number") {
            savePosition(String(n.id), n.x, n.y);
          }
        }}
        nodeCanvasObject={(node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as unknown as KGNode & { x: number; y: number };
          const degree = (n as any).degree || 0;
          const baseR = 4 + Math.log2(1 + degree);
          const r = baseR * Math.min(globalScale, 3);
          const isHL = n.id != null && highlightIds.has(String(n.id));

          // highlight halo
          if (isHL) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 1.35, 0, Math.PI * 2);
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = "#ffd54f";
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          // node circle
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = (n as any).color || "#7aa2ff";
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
        nodePointerAreaPaint={(node: NodeObject, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as unknown as KGNode & { x: number; y: number };
          const degree = (n as any).degree || 0;
          const baseR = 4 + Math.log2(1 + degree);
          const r = baseR * Math.min(globalScale, 3);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 1.5 * Math.PI, false); // bigger hit area
          ctx.fill();
        }}
        linkWidth={(l: any) => {
          const sid = typeof l.source === "object" ? String((l.source as any).id) : String(l.source);
          const tid = typeof l.target === "object" ? String((l.target as any).id) : String(l.target);
          return highlightIds.has(sid) && highlightIds.has(tid) ? 1.6 : 0.6;
        }}
        linkDirectionalParticles={0}
      />

      {/* Mode indicator & Back button */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 text-xs">
        <div className="pointer-events-auto rounded-full bg-black/70 px-3 py-1 text-white">
          Mode: <span className="font-semibold">{mode}</span>
        </div>
        {stackDepth > 0 && (
          <button
            onClick={handleBack}
            className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 font-medium text-gray-800 shadow hover:bg-white"
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
