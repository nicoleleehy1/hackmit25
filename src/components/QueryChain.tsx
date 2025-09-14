// components/QueryChain.tsx
"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useGraphStore } from "../store/useGraphStore";
import type { Graph as StoreGraph, Node as StoreNode, Edge as StoreEdge, Source } from "../store/useGraphStore";
import { makeStarGraph, type ServerGraph } from "./makeStarGraph";

// ----- Exa types -----
type ExaDoc = { id: string; title: string; snippet?: string; text?: string };
type ExaResponse = { results: ExaDoc[] };

// ----- Store slice typing (what we read) -----
type GraphStoreSlice = {
  setFromResponse?: (payload: { graph: StoreGraph; sources?: Source[] }) => void;
  setGraph?: (graph: StoreGraph) => void;
};

// expose our click handler on window for the graph component
declare global {
  interface Window {
    __promoteToCenter?: (q: string) => void;
  }
}

// Convert helper graph -> store graph
function toStoreGraph(sg: ServerGraph): StoreGraph {
  const nodes: StoreNode[] = sg.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    summary: n.summary ?? "",
  }));
  const edges: StoreEdge[] = sg.edges.map((e) => ({
    source: String(e.source),
    target: String(e.target),
    label: e.label ?? "",
  }));
  return { nodes, edges };
}

async function fetchResults(query: string, apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    throw new Error("Missing Exa API key. Define NEXT_PUBLIC_EXA_API_KEY in .env.local");
  }
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || "request failed"}`);
  }
  const data = (await res.json()) as ExaResponse;
  if (!Array.isArray(data.results)) throw new Error("API response missing results array");
  return data.results.map(
    (r, i) =>
      r.title?.trim() ||
      r.snippet?.trim() ||
      r.text?.slice(0, 120)?.trim() ||
      `Result ${i + 1}`
  );
}

export type QueryChainProps = {
  initialQuery: string;
  onActiveQueryChange?: (q: string) => void;
};

const QueryChain: React.FC<QueryChainProps> = ({ initialQuery, onActiveQueryChange }) => {
  const [activeQuery, setActiveQuery] = useState<string>(initialQuery);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ select with store types, not `any`
  const { setFromResponse, setGraph } = useGraphStore<GraphStoreSlice>((s) => ({
    setFromResponse: s.setFromResponse,
    setGraph: s.setGraph,
  }));

  const apiKey = process.env.NEXT_PUBLIC_EXA_API_KEY as string | undefined;

  const promoteToCenter = useCallback(
    (nextQuery: string) => {
      setActiveQuery(nextQuery);
      onActiveQueryChange?.(nextQuery);
    },
    [onActiveQueryChange]
  );

  useEffect(() => {
    window.__promoteToCenter = promoteToCenter;
    return () => { delete window.__promoteToCenter; };
  }, [promoteToCenter]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const q = activeQuery.trim();
      if (!q) return;

      setLoading(true);
      setErr(null);

      try {
        const titles = await fetchResults(q, apiKey);
        if (cancelled) return;

        const serverGraph: ServerGraph = makeStarGraph(q, titles);
        const storeGraph: StoreGraph = toStoreGraph(serverGraph); // 👈 convert

        if (typeof setFromResponse === "function") {
          setFromResponse({ graph: storeGraph });
        } else if (typeof setGraph === "function") {
          setGraph(storeGraph);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Search failed";
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeQuery, apiKey, setFromResponse, setGraph]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Center: <strong style={{ color: "#111827" }}>{activeQuery}</strong>
        {loading ? " — loading…" : null}
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div>}
      <div style={{ fontSize: 11, color: "#6b7280" }}>
        Tip: click any surrounding node to recenter the graph.
      </div>
    </div>
  );
};

export default QueryChain;
