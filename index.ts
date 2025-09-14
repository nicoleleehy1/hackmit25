import express, { Request, Response } from "express";  // ✅ add types
import cors from "cors";
import { exaSearchSummarized } from "./exaHelper";     // you already have this
import { graphFromSummaries } from "./graphify";

import "dotenv/config";
const exaKey = process.env.EXA_API_KEY;
if (!exaKey) throw new Error("Missing EXA_API_KEY in environment");

const app = express();
const PORT = Number(process.env.PORT) || 4000;         // ✅ ensure number

// ✅ CORS — allow your front-end origins
app.use(cors({ origin: ["http://localhost:3000", "http://localhost:3001"] }));
app.use(express.json());

// --- TEST ROUTE (use the helper you already import) ---
app.get("/api/test/exa", async (_req: Request, res: Response) => {
  try {
    const results = await exaSearchSummarized("latest AI models", 3);
    res.json(results);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// --- DEMO STATIC GRAPH ---
app.post("/api/graph/generate", (req: Request, res: Response) => {
  const { topic } = req.body as { topic?: string };
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

// --- HEALTH ---
app.get("/health", (_req: Request, res: Response) => {
  res.send("ok");
});

// --- DYNAMIC GRAPH SEARCH (called by PromptBar) ---
app.post("/api/graph/search", async (req: Request, res: Response) => {
  try {
    const query = (req.body?.query ?? "").toString().trim();
    const limit = Number(req.body?.limit ?? 8);
    if (!query) return res.status(400).json({ error: "Missing 'query' string" });

    console.log("POST /api/graph/search", { query, limit }); // ✅ helpful log

    // 1) Exa search with summaries
    const results = await exaSearchSummarized(query, Math.max(3, Math.min(limit, 12)));

    // 2) Convert -> { graph, sources }
    const { graph, sources } = graphFromSummaries(query, results);

    // 3) Respond
    res.json({ graph, sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
