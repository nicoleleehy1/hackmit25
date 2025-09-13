import express from "express";
import cors from "cors";
import { exaSearchSummarized } from "./exaHelper";   // new helper
import { graphFromSummaries } from "./graphify";     // new graph builder


//api key config
import "dotenv/config";
const exaKey = process.env.EXA_API_KEY;
if (!exaKey) throw new Error("Missing EXA_API_KEY in environment");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

import { exaSearch } from "./exaHelper";

app.get("/api/test/exa", async (_req, res) => {
  try {
    const results = await exaSearch("latest AI models", true);
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// demo route: generate a static graph
app.post("/api/graph/generate", (req, res) => {
  const { topic } = req.body;

  // For now, just return a static graph regardless of input
  const demoGraph = {
    nodes: [
      { id: "n1", label: topic || "Root Topic", summary: "This is the main concept" },
      { id: "n2", label: "Subtopic A", summary: "Description of Subtopic A" },
      { id: "n3", label: "Subtopic B", summary: "Description of Subtopic B" }
    ],
    edges: [
      { source: "n1", target: "n2", label: "related_to" },
      { source: "n1", target: "n3", label: "related_to" }
    ]
  };

  res.json(demoGraph);
});


app.get("/health", (_req, res) => {
  res.send("ok");
});

// New dynamic graph search route
app.post("/api/graph/search", async (req, res) => {
  try {
    const query = (req.body?.query ?? "").toString().trim();
    const limit = Number(req.body?.limit ?? 8);

    if (!query) {
      return res.status(400).json({ error: "Missing 'query' string" });
    }

    // 1. Search Exa with summaries
    const results = await exaSearchSummarized(query, Math.max(3, Math.min(limit, 12)));

    // 2. Convert results -> nodes/edges
    const { graph, sources } = graphFromSummaries(query, results);

    // 3. Send to frontend
    res.json({ graph, sources });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
