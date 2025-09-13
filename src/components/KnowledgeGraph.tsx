"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { NodeObject } from "force-graph";
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

export default function KnowledgeGraph() {
  const {
    graph,
    highlightIds,
    mode,
    pendingSource,
    setPendingSource,
    rewireLink,
    savePosition,
    // we'll use setGraph to replace the entire view on zoom-in
    setGraph,
    resetViewKey,
  } = useGraphStore();

  const fgRef = useRef<any>(null);

  // Prezi-like navigation stack: store previous graphs here
  const viewStackRef = useRef<GraphData[]>([]);
  const [stackDepth, setStackDepth] = useState(0);

  // Allow force simulation temporarily when we swap graphs
  const [cooldownTicks, setCooldownTicks] = useState<number | undefined>(0);

  // Zoom-to-fit whenever graph changes or when resetViewKey increments
  useEffect(() => {
    const el = fgRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      try { el.zoomToFit(400, 50); } catch {}
    }, 60);
    return () => clearTimeout(t);
  }, [graph.nodes.length, graph.links.length, resetViewKey]);

  function buildFocusedGraph(centerNode: KGNode): GraphData {
    const center: KGNode = {
      ...centerNode,
      // pin center near origin initially for a smooth intro
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
    // a couple of sibling links for structure
    if (children.length > 3) {
      links.push({ id: uid(), source: children[0].id, target: children[2].id });
      links.push({ id: uid(), source: children[1].id, target: children[3].id });
    }

    // ensure center is first for any size-based draw logic
    return { nodes: [center, ...children], links };
  }

  function preziZoomIntoNode(n: any) {
    const el = fgRef.current;
    if (el && typeof n?.x === "number" && typeof n?.y === "number") {
      // 1) zoom into the clicked node
      el.centerAt(n.x, n.y, 400);
      el.zoom(12, 400);
    }

    // 2) after zoom-in, swap to a new graph centered on that node
    setTimeout(() => {
      // push current graph to stack for Back navigation
      viewStackRef.current.push(structuredClone(graph));
      setStackDepth(viewStackRef.current.length);

      const focused = buildFocusedGraph((n as KGNode));

      // let the simulation run briefly to settle the new view
      setCooldownTicks(60);
      setGraph(focused);

      // 3) center and zoom out a bit to see the new subgraph nicely
      setTimeout(() => {
        const el2 = fgRef.current;
        try {
          if (el2) {
            el2.centerAt(0, 0, 400);
            el2.zoom(4, 400);
          }
        } catch {}
        // stop running simulation after some time
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
            // Select/Zoom mode → Prezi-like zoom into a fresh focused graph
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
          const r = 4 + Math.log2(1 + degree);
          const isHL = n.id != null && highlightIds.has(String(n.id));

          // highlight halo
          if (isHL) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI * 2);
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = "#ffd54f";
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          // node glyph
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = (n as any).color || "#7aa2ff";
          ctx.fill();

          // label only when zoomed in
          if (globalScale > 2.3) {
            const label = (n as any).label || n.title || String(n.id);
            ctx.font = `${Math.max(8, 14 / globalScale)}px ui-sans-serif, system-ui, -apple-system`;
            ctx.textBaseline = "middle";
            ctx.fillStyle = "black";
            ctx.fillText(label, n.x + r + 3, n.y);
          }
        }}
        nodePointerAreaPaint={(node: NodeObject, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as unknown as KGNode & { x: number; y: number };
          const size = 6 + Math.log2(1 + ((n as any).degree || 1));
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, size * 1.8, 0, 2 * Math.PI, false);
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
