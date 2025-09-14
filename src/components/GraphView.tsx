// components/GraphView.tsx (example)
"use client";
import React from "react";
import ForceGraph2D, { NodeObject } from "react-force-graph-2d";
import { useGraphStore } from "../store/useGraphStore";

const GraphView: React.FC = () => {
  const graph = useGraphStore((s: any) => s.graph);

  return (
    <ForceGraph2D
      graphData={graph}
      nodeLabel={(n: any) => n.label}
      onNodeClick={(node: NodeObject) => {
        const n = node as any;
        const id: string = n.id || "";
        const label: string = n.label || "";
        if (id.startsWith("center:")) return; // don't promote center
        if (typeof window !== "undefined" && (window as any).__promoteToCenter && label) {
          (window as any).__promoteToCenter(label);
        }
      }}
    />
  );
};

export default GraphView;
