"use client";
import React, { useState } from "react";
import { useGraphStore } from "../store/useGraphStore";
type ServerNode = { id: string; label: string; summary?: string };
type ResultServerNode = { id: string; title: string; summary?: string };
type ServerEdge = { source: string; target: string; label?: string };
type ServerGraph = { nodes: ServerNode[]; edges: ServerEdge[] };
const PromptBar: React.FC = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setErrMsg(null);
//
    try {
      const API =
        process.env.NEXT_PUBLIC_API_BASE ||
        `http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:3000`;
      console.log(">>>> API and query:")
      console.log(API)
      console.log(query) // in the other file put title inside instead
      console.log(window.location.hostname)
      
      const res = await fetch(`https://api.exa.ai/search`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": "3fc206e8-31b7-41f1-8c25-f184a0855f28" 
       },
        body: JSON.stringify({ query }),
      });
      //
      
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text || "request failed"}`);
      }
      const data = await res.json();
      console.log("got json")
      console.log(data)
      if (!Array.isArray(data.results)) {
        throw new Error("API response missing results array");
      }
      const clientNodes: ServerNode[] = data.results.map((n: ResultServerNode, i: number) => {
        const node: ServerNode = {
          id: n.id,
          label: n.title,
          summary:"test summary bummary",
        };
        return node;
      });
      const graph: ServerGraph = {
        nodes: clientNodes,
        edges: [],
      };
      for(const item of data.results) {
        console.log("result item:")
        console.log(item)
      }
      // If your store has setFromResponse, use it:
      if (useGraphStore.getState().setFromResponse) {
        console.log("got json111")
        useGraphStore.getState().setFromResponse({ graph });
      } else if (useGraphStore.getState().setGraph) {
        // fallback if you only have setGraph
        console.log("got json222")
        useGraphStore.getState().setGraph(data.graph); //this line controlls it 
      }
    } catch (err: unknown) {
      console.error("Graph search failed:", err);
      setErrMsg(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };
  //
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: "fixed",
        top: "10%",
        left: "28%",
        zIndex: 1000,
        background: "#fff",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        minWidth: "400px",
        gap: "8px",
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="What would you like to learn more about?"
        style={{
          border: "none",
          outline: "none",
          fontSize: "16px",
          width: "100%",
          background: "transparent",
          color: "#000",
        }}
      />
      {/* Visible trigger that calls the backend */}
      <button
  type="submit"
  disabled={loading || !query.trim()}
  style={{
    padding: "6px 10px",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
    background: loading ? "#e5e7eb" : "#f9fafb",
    cursor: loading ? "not-allowed" : "pointer",
    fontSize: "14px",
    color: "#000",   // 🔹 Black text
  }}
  title="Search"
>
  {loading ? "Searching…" : "Search"}
</button>
      {/* optional tiny error text */}
      {errMsg && (
        <span style={{ color: "#b91c1c", fontSize: "12px", marginLeft: "4px" }}>
          {errMsg}
        </span>
      )}
    </form>
  );
};
export default PromptBar;
