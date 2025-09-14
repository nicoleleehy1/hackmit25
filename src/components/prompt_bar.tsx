// src/components/prompt_bar.tsx
"use client";
import React, { useState } from "react";
import QueryChain from "./QueryChain"; // adjust path if needed

const PromptBar: React.FC = () => {
  const [query, setQuery] = useState("");
  const [firstQueryForChain, setFirstQueryForChain] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    setFirstQueryForChain(query);           // seed the chain
    // optional: keep the bar in sync as chain recenters:
    // it will update via QueryChain's onActiveQueryChange below
  };

  return (
    <>
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
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
        <button
          type="submit"
          disabled={!query.trim()}
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: !query.trim() ? "not-allowed" : "pointer",
            fontSize: "14px",
            color: "#000",
          }}
          title="Search"
        >
          Search
        </button>
      </form>

      {firstQueryForChain && (
        <div style={{ position: "fixed", top: "18%", left: "26%", zIndex: 1000 }}>
          <QueryChain
            initialQuery={firstQueryForChain}
            onActiveQueryChange={setQuery} // keeps the bar text synced with the center
          />
        </div>
      )}
    </>
  );
};

export default PromptBar;
