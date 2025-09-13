import React, { useState } from "react";

const PromptBar: React.FC = () => {
    const [query, setQuery] = useState("");

    return (
        <div
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
                minWidth: "400px", // 🔹 made bar longer
            }}
        >
            <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="What would you like to learn more about?"
                style={{
                    border: "none",
                    outline: "none",
                    fontSize: "16px",
                    width: "100%",
                    background: "transparent",
                    color: "#000", // 🔹 black text
                }}
            />
        </div>
    );
};

export default PromptBar;
