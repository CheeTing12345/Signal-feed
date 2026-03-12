const TAVILY_KEY = process.env.TAVILY_API_KEY;

const QUERIES = {
  design: [
    "site:reddit.com/r/UXDesign AI tools designers 2025",
    "site:reddit.com/r/graphic_design AI generative design workflow",
    "site:reddit.com AI Figma Framer design experience",
    "site:x.com AI design tools workflow designers",
    "site:x.com generative UI AI design system",
    "AI Figma plugin new feature announcement 2025",
    "AI design tool B2B product launch 2025",
    "site:github.com AI design system generative UI tool",
  ],
  "product-design": [
    "site:reddit.com/r/UXDesign AI product design UX patterns",
    "site:reddit.com AI copilot B2B SaaS UX experience",
    "site:reddit.com LLM product design conversational UI",
    "site:x.com AI product design UX B2B patterns 2025",
    "site:x.com AI onboarding UX design experience",
    "AI product design case study B2B SaaS 2025",
    "user research AI adoption product design insights 2025",
    "site:github.com AI UX component conversational interface",
  ],
  "product-management": [
    "site:reddit.com/r/productmanagement AI tools PM workflow 2025",
    "site:reddit.com/r/ProductManagement AI PRD roadmap experience",
    "site:reddit.com AI product manager tools honest review",
    "site:x.com AI product management PRD strategy 2025",
    "site:x.com PM using AI tools product roadmap workflow",
    "AI product management tool launch announcement 2025",
    "AI product strategy B2B case study 2025",
    "site:github.com AI product management PRD tool",
  ],
};

async function searchTavily(query) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_KEY,
      query,
      search_depth: "basic",
      max_results: 4,
      include_answer: false,
      days: 30,
    }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

function detectSource(url = "") {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return { key: "youtube", name: "YouTube" };
  if (u.includes("twitter.com") || u.includes("x.com")) return { key: "twitter", name: "X / Twitter" };
  if (u.includes("linkedin.com")) return { key: "linkedin", name: "LinkedIn" };
  if (u.includes("reddit.com")) {
    const match = url.match(/reddit\.com\/r\/([^/]+)/);
    return { key: "reddit", name: match ? `r/${match[1]}` : "Reddit" };
  }
  if (u.includes("github.com")) return { key: "github", name: "GitHub" };
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return { key: "article", name: host };
  } catch {
    return { key: "article", name: "Article" };
  }
}

function formatPublishedDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return { label: "Today", daysAgo: 0, iso: d.toISOString() };
    if (diffDays === 1) return { label: "Yesterday", daysAgo: 1, iso: d.toISOString() };
    if (diffDays < 7) return { label: `${diffDays} days ago`, daysAgo: diffDays, iso: d.toISOString() };
    if (diffDays < 30) return { label: `${Math.floor(diffDays / 7)}w ago`, daysAgo: diffDays, iso: d.toISOString() };
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), daysAgo: diffDays, iso: d.toISOString() };
  } catch { return null; }
}

function dedup(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function score(item) {
  const u = (item.url || "").toLowerCase();
  if (u.includes("reddit.com") || u.includes("x.com") || u.includes("twitter.com")) return 3;
  if (u.includes("github.com") || u.includes("youtube.com")) return 1;
  return 0;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const clusters = {};

    for (const [cat, queries] of Object.entries(QUERIES)) {
      const allResults = [];
      await Promise.all(queries.map(async (q) => {
        try {
          const results = await searchTavily(q);
          allResults.push(...results);
        } catch (e) { console.error(`Query failed: ${q}`, e.message); }
      }));

      const items = dedup(allResults)
        .sort((a, b) => {
          const sd = score(b) - score(a);
          if (sd !== 0) return sd;
          const da = a.published_date ? new Date(a.published_date).getTime() : 0;
          const db = b.published_date ? new Date(b.published_date).getTime() : 0;
          return db - da;
        })
        .slice(0, 8)
        .map(r => {
          const src = detectSource(r.url);
          return {
            title: r.title,
            url: r.url,
            snippet: r.content ? r.content.slice(0, 200).trim() + "…" : "",
            source: src.key,
            sourceName: src.name,
            publishedDate: formatPublishedDate(r.published_date),
          };
        });

      clusters[cat] = items;
    }

    res.status(200).json({ clusters, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
