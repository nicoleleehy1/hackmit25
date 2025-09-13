export type Node = { id: string; label: string; summary: string };
export type Edge = { source: string; target: string; label: string };
export type Graph = { nodes: Node[]; edges: Edge[] };

type Summ = { title: string; url: string; summary?: string; domain?: string };

export function graphFromSummaries(query: string, items: Summ[]) {
  const nodes: Node[] = [{ id: "n0", label: query, summary: "Search root" }];
  const edges: Edge[] = [];
  const sources: { id: string; title: string; url: string }[] = [];

  items.forEach((it, i) => {
    const id = `n${i + 1}`;
    nodes.push({
      id,
      label: truncate(it.title || it.domain || "Result"),
      summary: truncate(it.summary || "", 320),
    });
    edges.push({ source: "n0", target: id, label: "result" });
    sources.push({ id, title: it.title || "(untitled)", url: it.url });
  });

  // (optional) lightweight cross-links by domain
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].domain && items[i].domain === items[j].domain) {
        edges.push({ source: `n${i + 1}`, target: `n${j + 1}`, label: "same-domain" });
      }
    }
  }

  return { graph: { nodes, edges }, sources };
}

function truncate(s: string, n = 300) { return s && s.length > n ? s.slice(0, n - 1) + "…" : s; }
