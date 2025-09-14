"use client";

import KnowledgeGraph from "../components/KnowledgeGraph"; // adjust path if needed
import { useGraphStore } from "../store/useGraphStore";
import type { Mode } from "../types/graph";
import PromptBar from "../components/prompt_bar";
import SourcesPanel from "../components/SourcesPanel";


export default function Page() {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const bumpReset = useGraphStore((s) => s.bumpReset);

  const ModeButton = ({ m, label }: { m: Mode; label: string }) => {
    const isActive = mode === m;
    return (
      <button
        onClick={() => setMode(m)}
        className={`
          rounded-xl border px-3 py-1 text-sm
          ${
            isActive
              ? "bg-blue-500 text-white"
              : "text-white-800 hover:bg-gray-50 hover:text-black"
          }
        `}
      >
        {label}
      </button>
    );
  };

  return (
    <main className="h-screen w-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white-700">Knowledge Graph</span>
          <div className="mx-3 h-4 w-px bg-gray-200" />
          <ModeButton m="default" label="Select/Expand" />
          <ModeButton m="connect" label="Connect" />
          <ModeButton m="add" label="Add a Node" />
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

      <PromptBar />

      <div
        className="
          absolute top-14 right-0
          h-[calc(100%-3.5rem)]
          bg-white border-l overflow-auto
        "
        style={{ width: "23rem" }}
      >
        <SourcesPanel />
      </div>
      
    </main>
  );
}
