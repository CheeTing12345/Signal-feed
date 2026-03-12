const TAVILY_KEY = process.env.TAVILY_API_KEY;

const QUERIES = {
  design: [
    "AI design tools Figma Framer new features 2025",
    "generative UI AI design workflow designers",
    "site:reddit.com AI design tools UX 2025",
    "site:github.com AI design system tool",
    "AI design B2B product announcement",
  ],
  "product-design": [
    "AI product design UX patterns B2B SaaS 2025",
    "LLM product UX onboarding conversational UI",
    "site:reddit.com AI feature UX product design experience",
    "AI copilot B2B product design case study",
    "user research AI adoption product design insights",
  ],
  "product-management": [
    "AI product management PRD roadmap tools 2025",
    "site:reddit.com PM using AI tools product management",
    "AI product strategy B2B case study 2025",
    "site:github.com AI product management tool",
    "product manager AI workflow announcement",
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
      max_results: 3,
      include_answer: false,
      days: 60,
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

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function dedup(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const clusters = {};

    for (const [cat, queries] of Object.entries(QUERIES)) {
      const allResults = [];

      await Promise.all(
        queries.map(async (q) => {
          try {
            const results = await searchTavily(q);
            allResults.push(...results);
          } catch (e) {
            console.error(`Query failed: ${q}`, e.message);
          }
        })
      );

      const items = dedup(allResults).slice(0, 7).map(r => {
        const src = detectSource(r.url);
        return {
          title: r.title,
          url: r.url,
          snippet: r.content ? r.content.slice(0, 180).trim() + "…" : "",
          source: src.key,
          sourceName: src.name,
          daysAgo: daysAgo(r.published_date),
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
