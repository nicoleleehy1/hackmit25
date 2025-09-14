// components/QueryChain.tsx
"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useGraphStore } from "../store/useGraphStore";
import { makeStarGraph, type ServerGraph } from "./makeStarGraph";

// --- local minimal store types (avoid depending on store exports) ---
type StoreNode = { id: string; label: string; summary: string };
type StoreEdge = { source: string; target: string; label: string };
type StoreGraph = { nodes: StoreNode[]; edges: StoreEdge[] };

// slice we care about; all optional so we don't fight TS
type GraphFns = {
  setFromResponse?: (payload: { graph: StoreGraph; sources?: unknown[] }) => void;
  setGraph?: (graph: StoreGraph) => void;
  mergeGraph?: (graph: StoreGraph) => void; // if your store has it
};

type ExaDoc = { id: string; title: string; snippet?: string; text?: string };
type ExaResponse = { results: ExaDoc[] };

declare global {
  interface Window {
    __promoteToCenter?: (q: string) => void;
  }
}

// Make ids unique per center so merges never overwrite
function toStoreGraphWithUniqueIds(sg: ServerGraph, centerKey: string): StoreGraph {
  const centerId = `center:${centerKey}`;
  const nodes: StoreNode[] = [];
  sg.nodes.forEach((n, i) => {
    const id =
      i === 0 || String(n.id).startsWith("center:")
        ? String(n.id)
        : `res:${centerKey}:${i - 1}`;
    nodes.push({ id, label: n.label, summary: n.summary ?? "" });
  });
  const edges: StoreEdge[] = [];
  for (let i = 1; i < sg.nodes.length; i++) {
    edges.push({ source: centerId, target: `res:${centerKey}:${i - 1}`, label: "" });
  }
  return { nodes, edges };
}

async function fetchResults(query: string, apiKey?: string): Promise<string[]> {
  if (!apiKey) throw new Error("Missing Exa API key. Define NEXT_PUBLIC_EXA_API_KEY in .env.local");

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || "request failed"}`);
  }
  const data = (await res.json()) as ExaResponse;
  if (!Array.isArray(data.results)) throw new Error("API response missing results array");
  return data.results.map(
    (r, i) => r.title?.trim() || r.snippet?.trim() || r.text?.slice(0, 120)?.trim() || `Result ${i + 1}`
  );
}

export type QueryChainProps = {
  initialQuery: string;
  onActiveQueryChange?: (q: string) => void;
};

const QueryChain: React.FC<QueryChainProps> = ({ initialQuery, onActiveQueryChange }) => {
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // select optional functions individually (prevents getSnapshot warning)
  const setFromResponse = useGraphStore((s: any) => s.setFromResponse as GraphFns["setFromResponse"]);
  const setGraph        = useGraphStore((s: any) => s.setGraph        as GraphFns["setGraph"]);
  const mergeGraph      = useGraphStore((s: any) => s.mergeGraph      as GraphFns["mergeGraph"]);

  const apiKey = process.env.NEXT_PUBLIC_EXA_API_KEY as string | undefined;

  const promoteToCenter = useCallback((nextQuery: string) => {
    setActiveQuery(String(nextQuery || "").trim());
    onActiveQueryChange?.(String(nextQuery || "").trim());
  }, [onActiveQueryChange]);

  useEffect(() => {
    window.__promoteToCenter = promoteToCenter;
    return () => { delete window.__promoteToCenter; };
  }, [promoteToCenter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = activeQuery.trim();
      if (!q) return;
      setLoading(true); setErr(null);
      try {
        const titles = await fetchResults(q, apiKey);
        if (cancelled) return;
        const serverGraph = makeStarGraph(q, titles);
        const storeGraph  = toStoreGraphWithUniqueIds(serverGraph, q);

        if (typeof mergeGraph === "function") {
          mergeGraph(storeGraph);               // expand/accumulate
        } else if (typeof setFromResponse === "function") {
          setFromResponse({ graph: storeGraph });// replace
        } else if (typeof setGraph === "function") {
          setGraph(storeGraph);                  // replace
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeQuery, apiKey, setFromResponse, setGraph, mergeGraph]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Center: <strong style={{ color: "#111827" }}>{activeQuery}</strong>
        {loading ? " — loading…" : null}
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div>}
      <div style={{ fontSize: 11, color: "#6b7280" }}>
        Tip: click any surrounding node to recenter the graph. New stars will merge into the current view.
      </div>
    </div>
  );
};

export default QueryChain;
