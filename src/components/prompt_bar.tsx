"use client";

import React, { useState } from "react";
import { useGraphStore } from "../store/useGraphStore";

const PromptBar: React.FC = () => {
  const [query, setQuery] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      const res = await fetch("http://localhost:4000/api/graph/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      // updates nodes, edges, and sources at once
      useGraphStore.getState().setFromResponse(data);
    } catch (err) {
      console.error("Graph search failed", err);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 1000,
        background: "#fff",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        minWidth: "400px",
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
    </form>
  );
};

export default PromptBar;
