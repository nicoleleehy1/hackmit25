import "dotenv/config";
import Exa from "exa-js";
export { exaSearchSummarized as exaSearch };


const exa = new Exa(process.env.EXA_API_KEY!);


export async function exaSearchSummarized(query: string, numResults = 8): Promise<ExaSummarized[]> {
  // search + contents + summary in one shot
  const { results } = await exa.searchAndContents(query, {
    numResults,
    text: false,           // set true if you also want full text
    summary: true,         // <= ask Exa to summarize each page
    summaryQuery: query,   // <= steer the summary toward the user’s query
    // type: "auto"        // (optional) auto-picks keyword vs semantic
  });

  return results.map(r => ({
    title: r.title ?? "(untitled)",
    url: r.url,
    summary: r.summary,    // <= Exa-generated summary
    text: r.text,          // (might be undefined if text:false)
    domain: safeDomain(r.url),
  }));
}

function safeDomain(u?: string) {
  try { return new URL(u ?? "").hostname.replace(/^www\./, ""); }
  catch { return ""; }
}
