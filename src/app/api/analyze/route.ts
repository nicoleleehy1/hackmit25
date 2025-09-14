// src/app/api/analyze/route.ts
import Anthropic from "@anthropic-ai/sdk";
import * as mammoth from "mammoth";
import jschardet from "jschardet";

export const runtime = "nodejs"; // ensure Node runtime

const model = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type Hier = { layer1: string[]; layer2: string[]; layer3: string[] };

/* ====================== PROMPTS ====================== */
const HIERARCHY_SYSTEM = `You are a precise technical summarizer.
Given raw text, extract bullet points and group them into a strict 3-layer hierarchy:
- layer1 = main topics (broad, non-overlapping)
- layer2 = subtopics
- layer3 = sub-subtopics

Rules:
- Exhaust all content; never drop details. If a point fits nowhere, create a new topic.
- Each item SHORT (<= 12 words), noun-phrase style.
- No explanations—just labels.
- Deduplicate/merge near-duplicates.
- Output strictly JSON with keys: layer1, layer2, layer3 (arrays of strings).`;

const CHUNK_USER_TMPL = (chunk: string) => `Text chunk:
\`\`\`
${chunk}
\`\`\`

Return JSON with exactly:
{
  "layer1": [...],
  "layer2": [...],
  "layer3": [...]
}`;

const MERGE_USER_TMPL = (partialLines: string) => `Merge multiple partial hierarchies into a single consistent set.

Guidelines:
- Deduplicate by meaning ("Hiring" vs "Recruiting" -> pick one).
- If too specific for layer1, demote to layer2 or layer3.
- Keep layers balanced and exhaustive.
- Items concise.

Partials (one JSON object per line):
${partialLines}

Return JSON with exactly:
{
  "layer1": [...],
  "layer2": [...],
  "layer3": [...]
}`;

/* ====================== HELPERS ====================== */
function uniq(arr: string[]) {
  return Array.from(
    new Map(arr.map((s) => [s.trim().toLowerCase(), s.trim()])).values()
  ).filter(Boolean);
}

function chunkText(text: string, maxChars = 10_000) {
  const t = text.trim();
  if (t.length <= maxChars) return [t];
  const paras = t.split(/\r?\n/);
  const out: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of paras) {
    const withNL = p + "\n";
    if (len + withNL.length > maxChars && cur.length) {
      out.push(cur.join("").trim());
      cur = [];
      len = 0;
    }
    cur.push(withNL);
    len += withNL.length;
  }
  if (cur.length) out.push(cur.join("").trim());
  return out;
}

/* -------- file extract helpers (Blob-safe) -------- */
async function extractTextFromPDF(buf: Buffer): Promise<string> {
  // Dynamic import the actual parser file to avoid Turbopack pulling tests
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const res = await pdfParse(buf);
  return (res.text || "").trim();
}

async function extractTextFromDOCX(buf: Buffer): Promise<string> {
  const res = await mammoth.extractRawText({ buffer: buf });
  return (res.value || "").trim();
}

async function extractTextFromTXT(buf: Buffer): Promise<string> {
  const enc = jschardet.detect(buf as any)?.encoding || "utf-8";
  return Buffer.from(buf).toString(enc as BufferEncoding).trim();
}

// Accept any Blob-like + optional name (what Next server formData() returns)
async function extractTextFromUpload(f: Blob & { name?: string }): Promise<string> {
  const name = ((f as any).name || "").toLowerCase();
  const ab = await f.arrayBuffer();
  const buf = Buffer.from(ab);

  if (name.endsWith(".pdf")) return extractTextFromPDF(buf);
  if (name.endsWith(".docx")) return extractTextFromDOCX(buf);
  return extractTextFromTXT(buf); // txt/unknown → best-effort
}

/* -------- Claude call + hierarchy merge -------- */
async function callClaudeJSON(system: string, user: string): Promise<Hier> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  const msg = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    temperature: 0.2,
    system,
    messages: [{ role: "user", content: user }],
    // json_object is supported by SDK; TS types may lag, so cast
    response_format: { type: "json_object" as any },
  });

  const text = (msg.content as any[])
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Claude non-JSON response: ${text?.slice(0, 400)}...`);
  }

  const layer1 = Array.isArray(data.layer1) ? data.layer1.map(String) : [];
  const layer2 = Array.isArray(data.layer2) ? data.layer2.map(String) : [];
  const layer3 = Array.isArray(data.layer3) ? data.layer3.map(String) : [];
  return { layer1: uniq(layer1), layer2: uniq(layer2), layer3: uniq(layer3) };
}

async function buildHierarchy(raw: string): Promise<Hier> {
  const text = (raw || "").trim();
  if (!text) return { layer1: [], layer2: [], layer3: [] };

  const chunks = chunkText(text);
  const partials: Hier[] = [];
  for (const ch of chunks) {
    partials.push(await callClaudeJSON(HIERARCHY_SYSTEM, CHUNK_USER_TMPL(ch)));
  }

  if (partials.length === 1) return partials[0];

  const lines = partials.map((p) => JSON.stringify(p)).join("\n");
  return await callClaudeJSON(HIERARCHY_SYSTEM, MERGE_USER_TMPL(lines));
}

/* ====================== API ROUTE ====================== */
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // Node may not have global File; use Blob duck-typing
    const isBlobLike = (v: unknown): v is Blob & { name?: string } =>
      !!v && typeof v === "object" && typeof (v as any).arrayBuffer === "function";

    const files: (Blob & { name?: string })[] = [];
    const single = form.get("file");
    if (isBlobLike(single)) files.push(single);

    for (const v of form.getAll("files")) {
      if (isBlobLike(v)) files.push(v);
    }

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Per-file + merged results
    const per: Record<string, Hier> = {};
    const allTexts: string[] = [];

    for (const f of files) {
      const txt = await extractTextFromUpload(f);
      allTexts.push(txt);
      const name = (f as any).name || "file";
      per[name] = await buildHierarchy(txt);
    }

    const merged = await buildHierarchy(allTexts.join("\n\n"));

    return new Response(JSON.stringify({ results: per, merged }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: e?.message || String(e),
        stack: e?.stack?.slice?.(0, 2000),
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
