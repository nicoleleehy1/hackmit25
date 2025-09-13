"use client";

import KnowledgeGraph from "../components/KnowledgeGraph"; // adjust path if needed
import { useGraphStore } from "../store/useGraphStore";
import type { Mode } from "../types/graph";

export default function Page() {
  // ✅ Select stable values individually (no inline object)
  const setMode = useGraphStore((s) => s.setMode);
  const bumpReset = useGraphStore((s) => s.bumpReset);

  const ModeButton = ({ m, label }: { m: Mode; label: string }) => (
    <button
      onClick={() => setMode(m)}
      className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"
    >
      {label}
    </button>
  );

  return (
    <main className="h-screen w-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Knowledge Graph</span>
          <div className="mx-3 h-4 w-px bg-gray-200" />
          <ModeButton m="default" label="Select/Expand" />
          <ModeButton m="connect" label="Connect" />
          <ModeButton m="add" label="Add (later)" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => bumpReset()}
            className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Reset View
          </button>
          <a
            href="https://github.com/vasturiano/react-force-graph"
            className="text-xs text-blue-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Powered by react-force-graph
          </a>
        </div>
      </div>

      {/* Graph canvas */}
      <KnowledgeGraph />

      
    </main>
  );
}
