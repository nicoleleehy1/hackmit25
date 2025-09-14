// components/QueryChain.tsx
"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useGraphStore } from "../store/useGraphStore";
import { makeStarGraph, ServerGraph } from "./makeStarGraph";

type ExaDoc = { id: string; title: string; snippet?: string; text?: string };
type ExaResponse = { results: ExaDoc[] };

async function fetchResults(query: string, apiKey?: string): Promise<string[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || "request failed"}`);
  }
  const data = (await res.json()) as ExaResponse;
  if (!Array.isArray(data.results)) throw new Error("API response missing results array");
  // choose the visible text per result
  return data.results.map((r, i) => r.title?.trim() || r.snippet?.trim() || r.text?.slice(0, 120)?.trim() || `Result ${i + 1}`);
}

type Props = {
  initialQuery: string;
  exaApiKey?: string; // or rely on NEXT_PUBLIC_EXA_API_KEY via server env if you proxy
  onActiveQueryChange?: (q: string) => void;
};

const QueryChain: React.FC<Props> = ({ initialQuery, exaApiKey, onActiveQueryChange }) => {
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { setFromResponse, setGraph } = useGraphStore((s: any) => s);

  // expose for graph clicks
  const promoteToCenter = useCallback((nextQuery: string) => {
    setActiveQuery(nextQuery);
    onActiveQueryChange?.(nextQuery);
  }, [onActiveQueryChange]);

  // Put a function on the store so your Graph component can call it on node click.
  useEffect(() => {
    // If your store already has a setter for “onNodeClick”, reuse that. Otherwise:
    if (typeof window !== "undefined") {
      // @ts-ignore – stash for your graph renderer to read
      window.__promoteToCenter = promoteToCenter;
    }
  }, [promoteToCenter]);

  // Whenever activeQuery changes, fetch and rebuild the star graph
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeQuery.trim()) return;
      setLoading(true); setErr(null);
      try {
        const titles = await fetchResults(activeQuery, exaApiKey);
        if (cancelled) return;
        const graph: ServerGraph = makeStarGraph(activeQuery, titles);

        if (typeof setFromResponse === "function") {
          setFromResponse({ graph });
        } else if (typeof setGraph === "function") {
          setGraph(graph);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeQuery, exaApiKey, setFromResponse, setGraph]);

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
