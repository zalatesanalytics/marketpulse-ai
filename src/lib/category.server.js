import { collectScrape, rankScore, startScrape } from "@/lib/apify.server";

const PLATFORMS = ["reddit", "x", "youtube"];
const MAX_ITEMS = 18;
// Same grace as a brand read: after this long the answer goes ahead with the platforms
// that finished rather than holding the client for the slowest actor.
const GRACE_MS = 75000;

const RESOLVE_SCHEMA = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["category", "unclear"] },
    category: { type: "string" },
    region: { type: "string" },
    brands: { type: "array", items: { type: "string" } },
    search: { type: "string" },
    windowDays: { type: "integer" },
    goal: { type: "string" },
  },
  required: ["mode", "category", "region", "brands", "search", "windowDays", "goal"],
};

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    post_ids: { type: "array", items: { type: "number" } },
  },
  required: ["answer", "post_ids"],
};

const resolvePrompt = (question) => `A client on a social listening desk asked this question:

"${question}"

Work out what they are asking about.
- mode: "category" when they ask about a whole market or category — which brand leads, the most discussed brand, what is happening in a sector — without naming one brand themselves. "unclear" when they named no brand and no category.
- category: the market category in two or three words ("footwear", "coffee chain", "budget airline").
- region: the city or country they named, otherwise "".
- brands: 4 or 5 real brands that compete in that category (in that region when one was given), the ones most likely to be discussed. Never invent a brand, and never return a person, athlete, film, game or place.
- search: a short phrase someone would actually type to find this conversation ("running shoes Canada", "coffee Toronto"). Include the region when one was given.
- windowDays: the time window they asked for, in days, between 7 and 90. Use 30 when they did not say.
- goal: one sentence on the decision this supports.

Never guess a brand for a question that is not about a category or a market.`;

export async function resolveCategory({ base44, question }) {
  const out = await base44.integrations.Core.InvokeLLM({
    prompt: resolvePrompt(question),
    response_json_schema: RESOLVE_SCHEMA,
    model: "gemini_3_flash",
  });

  const category = String(out?.category || "").trim().slice(0, 80);
  const brands = (out?.brands || [])
    .map((brand) => String(brand || "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);

  if (out?.mode !== "category" || !category || brands.length < 2) return null;

  return {
    category,
    region: String(out?.region || "").trim().slice(0, 60),
    search: String(out?.search || "").trim().slice(0, 90) || category,
    brands,
    goal: String(out?.goal || "").trim().slice(0, 240),
    windowDays: Math.max(7, Math.min(90, Number(out?.windowDays) || 30)),
  };
}

export async function startCategoryScrapes({ brief }) {
  const query = [brief.search, ...brief.brands].join(" OR ").slice(0, 300);
  const settled = await Promise.allSettled(
    PLATFORMS.map((platform) =>
      startScrape({ platform, query, maxItems: MAX_ITEMS, days: brief.windowDays })
    )
  );

  const runs = [];
  const warnings = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") runs.push(result.value);
    else warnings.push(result.reason?.message || `${PLATFORMS[index]} could not be read.`);
  });

  return { runs, warnings };
}

// Same collect-then-wait shape as a brand read, without the brand gate: a category read
// wants every post that names any of the candidate brands.
export async function readCategorySample({ brief, runs, elapsedMs = 0 }) {
  const settled = await Promise.allSettled(runs.map((run) => collectScrape(run)));

  const warnings = [];
  const pending = [];
  const seen = new Set();
  const collected = [];

  settled.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      warnings.push(result.reason?.message || `${runs[index].platform} could not be read.`);
      return;
    }
    const out = result.value;
    if (out.pending) {
      pending.push(out.platform);
      return;
    }
    if (out.failed) warnings.push(out.failed);
    out.items.forEach((post) => {
      const key = post.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60) || post.url;
      if (!key || seen.has(key)) return;
      seen.add(key);
      collected.push(post);
    });
  });

  if (pending.length) {
    if (!collected.length || elapsedMs < GRACE_MS) {
      return { pending: true, pendingPlatforms: pending, posts: [], warnings };
    }
    warnings.push(
      `${pending.join(" and ")} ${pending.length > 1 ? "were" : "was"} still crawling, so this read covers the platforms that finished.`
    );
  }

  const cutoff = Date.now() - brief.windowDays * 86400000;
  const recent = collected.filter((post) => {
    const time = Date.parse(post.published_at || "");
    return Number.isNaN(time) || time >= cutoff;
  });

  const posts = (recent.length ? recent : collected).sort((a, b) => rankScore(b) - rankScore(a));
  return { pending: false, posts, warnings };
}

const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const mentionsBrand = (text, brand) =>
  new RegExp(`(^|[^a-z0-9])${escape(brand)}([^a-z0-9]|$)`, "i").test(String(text || ""));

const bodyOf = (post) => `${post.title || ""} ${post.excerpt || ""}`;

// Which of the candidate brands the sample actually talks about, most discussed first.
export function tallyBrands(posts, brands) {
  const ranked = brands
    .map((brand) => {
      const hits = posts.filter((post) => mentionsBrand(bodyOf(post), brand));
      return {
        brand,
        posts: hits.length,
        engagement: hits.reduce((sum, post) => sum + rankScore(post), 0),
        hits,
      };
    })
    .sort((a, b) => b.posts - a.posts || b.engagement - a.engagement);

  const matching = posts.filter((post) => brands.some((brand) => mentionsBrand(bodyOf(post), brand))).length;
  return { ranked, matching };
}

const day = (value) => String(value || "").slice(0, 10);

export function buildCategoryPrompt({ question, brief, posts, ranked, matching, digest }) {
  const top = ranked[0];
  const dates = posts
    .map((post) => day(post.published_at))
    .filter(Boolean)
    .sort();

  return `You are the analyst on Signal Desk's data-quality desk. The client asked a category question, so a live scrape was run and every brand mention in the sample was counted. Write the answer.

QUESTION: "${question}"

SAMPLE: ${posts.length} posts pulled from Reddit, X and YouTube for "${brief.search}", posted between ${
    dates[0] || "unknown"
  } and ${dates[dates.length - 1] || "unknown"} (the client asked about the last ${brief.windowDays} days${
    brief.region ? `, ${brief.region}` : ""
  }).
BRAND MENTIONS in that sample: ${ranked.map((entry) => `${entry.brand} ${entry.posts}`).join(" · ")}
MOST DISCUSSED: ${top.brand} (${top.posts} of ${matching} posts that name any of these brands)

POSTS
${digest}

Write the answer.
- 2 to 4 sentences of plain conversational English. No headings, no markdown, no lists.
- Open by naming ${top.brand} as the most discussed brand, with its count out of the sample, then name the next brand and its count.
- Use only the counts above. Never invent a number, a market share, a city split or a platform that was not read.
- Say plainly that this is a sample of the posts the scraper returned for that search, not a census of the market.
- If the question asks for something the sample cannot show (Instagram or TikTok, a different time window, sales figures), say so in one sentence.
- "post_ids": the 2 or 3 post numbers from the list above that best support the answer.`;
}

export { ANSWER_SCHEMA };