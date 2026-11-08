import { buildQuery, collectScrape, rankScore, startScrape } from "@/lib/apify.server";
import { buildBrandKeywords, gateByBrand } from "@/lib/brand-filter";

const TOP_N = 20;
// Score a few more candidates than the report shows, so the generic name matches
// removed afterwards do not eat the 20 places the report has. Each extra candidate
// costs scoring time, so this stays a little above the 20 needed.
const CANDIDATES = 30;
const PLATFORMS = ["reddit", "x", "youtube"];
// Posts asked of each scraper: enough for a brand-gated top 20, small enough that the
// slowest actor (YouTube) finishes sooner.
const PUBLIC_MAX_ITEMS = 15;
const PUBLIC_DAYS = 90;
// If a platform is still crawling after this long, the read goes ahead with the
// platforms that finished instead of holding everything for the slowest one.
const GRACE_MS = 75000;

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string" },
    category: { type: "string" },
    search: { type: "string" },
    competitors: { type: "array", items: { type: "string" } },
    goal: { type: "string" },
  },
  required: ["brand", "category", "search", "competitors", "goal"],
};

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          score: { type: "number" },
          reason: { type: "string" },
          evidence: { type: "string" },
          offTopic: { type: "boolean" },
        },
        required: ["index", "sentiment", "score", "reason", "evidence", "offTopic"],
      },
    },
    summary: { type: "string" },
    themes: { type: "array", items: { type: "string" } },
    trending_topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          mentions: { type: "integer" },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
        },
        required: ["topic", "mentions", "sentiment"],
      },
    },
    recommendation: { type: "string" },
  },
  required: ["posts", "summary", "trending_topics", "recommendation"],
};

const extractPrompt = (transcript) => `From this chat between a brand marketer and a social listening desk, extract the subject of the research.
- brand: the brand or product they want to understand (empty string if they never named one)
- category: the market category it competes in, as a short descriptor of two or three words ("sneaker brand", "coffee chain", "airline"), otherwise ""
- search: a short web search phrase that pins this brand down so that nothing else sharing the name matches. Include the category: "Jordan Brand sneakers" for Jordan, "Safari web browser" for Safari, "Dove soap" for Dove. Use the bare brand only when the name is already unique. Never include a person, a film, a game or a place.
- competitors: up to three competitors they mentioned, otherwise []
- goal: the decision this research would support, one sentence, otherwise ""
Never invent a brand. The marketer is researching a commercial brand, never a person or an athlete.

CONVERSATION:
${transcript}`;

const scorePrompt = (brief) => `You are a senior social listening analyst. Score the posts below for sentiment toward "${brief.brand}"${
  brief.category ? ` (category: ${brief.category})` : ""
}.
${brief.competitors?.length ? `Competitors in view: ${brief.competitors.join(", ")}.` : ""}
${brief.goal ? `The client needs this to decide: "${brief.goal}"` : ""}

For every numbered post return sentiment (positive | neutral | negative, judged toward ${brief.brand}), score between -1 (hostile) and 1 (advocating), reason (max 12 words, grounded only in the post text), and evidence: a fragment of at most 15 words copied word for word from that post which justifies the call.
Return exactly one row per numbered post, using its number as index. A positive label must carry a score above 0, a negative label below 0. If a post says too little to judge, use neutral with score 0 and say so in reason. Never invent, merge or reorder posts, and never quote text that is not in the post.
Set offTopic to true when the post is not actually about the brand ${brief.brand}${
  brief.category ? `, the ${brief.category},` : " the brand:"
} — a person or athlete with the same name, a different company, a team, place, film, game, or a coincidental word match. Posts about a same-named person say nothing about the brand and must never be scored, summarised or counted. Leave every off-topic post neutral with score 0. Be strict: a post that merely contains the brand word, without saying anything about the brand as a company or its products, is off-topic. If you are unsure whether a post is about the brand or about something that shares its name, mark it offTopic.
Then return:
- summary: 2-3 sentences on what the conversation as a whole says. Write it only from the posts that are about the brand; ignore everything you marked offTopic.
- trending_topics: the top 10 topics driving the conversation, most discussed first. Each: topic (2 to 5 words, specific to ${brief.brand}), mentions (listed posts that touch it, never a like or comment count), sentiment
- recommendation: 2-3 sentences of concrete next actions

Ground the summary, the topics and the recommendation only in the numbered posts above: never state a statistic, a theme or a post that is not listed.
Be strict: praise that is really a complaint is negative.`;

const SENTIMENTS = ["positive", "neutral", "negative"];

// Engagement per day since publication, so a week-old post and a year-old one are not
// compared on raw counts alone.
function velocityOf(post) {
  const time = Date.parse(post.published_at || "");
  if (Number.isNaN(time)) return 0;
  const days = Math.max((Date.now() - time) / 86400000, 1);
  return (Number(post.engagement) + Number(post.comments) * 2) / days;
}

function medianOf(values) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

function trendOf(post, median) {
  const velocity = velocityOf(post);
  if (!velocity || !median) return "steady";
  if (velocity >= median * 1.5) return "rising";
  if (velocity <= median * 0.6) return "cooling";
  return "steady";
}

// The label and the number have to agree, and both stay inside -1..1.
function clampScore(score, sentiment) {
  const n = Number(score);
  const bounded = Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  if (sentiment === "positive") return Number(Math.max(bounded, 0.2).toFixed(2));
  if (sentiment === "negative") return Number(Math.min(bounded, -0.2).toFixed(2));
  return Number(Math.max(-0.1, Math.min(0.1, bounded)).toFixed(2));
}

// Starts the platform scrapers without waiting for them, so no request has to hold
// the whole crawl. Returns the run handles to poll.
export async function startScrapes({
  brief,
  platforms = PLATFORMS,
  maxItems = PUBLIC_MAX_ITEMS,
  days = PUBLIC_DAYS,
}) {
  const query = buildQuery(brief.brand, brief.competitors.join(", "), brief.category, brief.search);
  const settled = await Promise.allSettled(
    platforms.map((platform) => startScrape({ platform, query, maxItems, days }))
  );

  const runs = [];
  const warnings = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") runs.push(result.value);
    else warnings.push(result.reason?.message || `${platforms[index]} could not be read.`);
  });

  return { runs, warnings };
}

// Reads every started run. While any is still crawling it returns { pending: true };
// once they are all in it ranks the top 20 and scores them.
export async function collectAndScore({ base44, brief, runs, days = PUBLIC_DAYS, elapsedMs = 0 }) {
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
    // Never wait on the slowest actor forever: once the grace period is up, rank what
    // came back and say which platform was left out of this read.
    if (!collected.length || elapsedMs < GRACE_MS) {
      return { ok: true, pending: true, pendingPlatforms: pending };
    }
    warnings.push(
      `${pending.join(" and ")} ${pending.length > 1 ? "were" : "was"} still crawling, so this read covers the platforms that finished.`
    );
  }
  if (!collected.length) {
    return { ok: false, error: warnings[0] || `No public posts turned up for ${brief.brand}.` };
  }

  // Reddit and YouTube only offer day/week/month/year windows, so keep the window here.
  const cutoff = Date.now() - days * 86400000;
  const recent = collected.filter((post) => {
    const time = Date.parse(post.published_at || "");
    return Number.isNaN(time) || time >= cutoff;
  });
  const pool = recent.length ? recent : collected;

  // Strict brand gate before anything is ranked: a post has to name the brand itself.
  // A pull for "Jordan" is full of the athlete's games, and those must never take a
  // top-20 place away from a post about the brand.
  const keywords = buildBrandKeywords(brief);
  const gated = gateByBrand(pool, keywords);
  if (!gated.kept.length) {
    return { ok: false, error: `Nothing in the pull actually mentioned ${brief.brand}.` };
  }
  if (gated.dropped) {
    warnings.push(
      `${gated.dropped} post${gated.dropped === 1 ? "" : "s"} never mentioned ${brief.brand} and ${
        gated.dropped === 1 ? "was" : "were"
      } left out.`
    );
  }

  const ranked = [...gated.kept].sort((a, b) => rankScore(b) - rankScore(a));
  // Keep every platform represented, then fill the candidate pool by engagement.
  const selected = [];
  PLATFORMS.forEach((platform) => {
    ranked
      .filter((post) => post.platform === platform)
      .slice(0, 5)
      .forEach((post) => {
        if (selected.length < CANDIDATES && !selected.includes(post)) selected.push(post);
      });
  });
  ranked.forEach((post) => {
    if (selected.length < CANDIDATES && !selected.includes(post)) selected.push(post);
  });

  const marked = selected.slice(0, CANDIDATES);

  const listing = (indices) =>
    indices
      .map((index) => {
        const post = marked[index];
        const body = (post.excerpt || "").replace(/\s+/g, " ").slice(0, 280);
        return `[${index + 1}] (${post.platform}, ${post.community || post.author}, ${post.engagement} likes/upvotes, ${post.comments} comments) ${post.title}${
          body ? ` — ${body}` : ""
        }`;
      })
      .join("\n");

  const askScore = (indices) =>
    base44.integrations.Core.InvokeLLM({
      prompt: `${scorePrompt(brief)}\n\nPOSTS:\n${listing(indices)}`,
      response_json_schema: SCORE_SCHEMA,
      model: "gemini_3_flash",
    });

  const allIndices = marked.map((_, index) => index);
  const rows = new Map();
  let analysis = null;

  try {
    analysis = await askScore(allIndices);
    (analysis?.posts || []).forEach((row) => {
      const index = row.index - 1;
      if (Number.isInteger(row.index) && allIndices.includes(index)) rows.set(index, row);
    });

    // A second pass for whatever the model skipped, so one weak row does not become
    // an unscored post in the table.
    const missing = allIndices.filter((index) => !rows.has(index));
    if (missing.length) {
      const retry = await askScore(missing);
      (retry?.posts || []).forEach((row) => {
        const index = row.index - 1;
        if (missing.includes(index) && !rows.has(index)) rows.set(index, row);
      });
    }
  } catch {
    warnings.push("Scoring failed, so no post carries a sentiment label.");
  }

  const unscored = allIndices.filter((index) => !rows.has(index)).length;
  if (unscored) warnings.push(`${unscored} of ${marked.length} posts could not be scored and are shown as neutral.`);

  // A brand name can match something else entirely (Nike pulls the game NIKKE), so
  // anything the scorer calls off-topic is dropped instead of counted as neutral coverage.
  const survivors = marked
    .map((post, index) => ({ post, row: rows.get(index) }))
    .filter(({ row }) => !row?.offTopic)
    .sort((a, b) => rankScore(b.post) - rankScore(a.post));
  const dropped = marked.length - survivors.length;
  if (dropped) {
    warnings.push(
      `${dropped} post${dropped === 1 ? "" : "s"} only shared the name and ${dropped === 1 ? "was" : "were"} about something else, so ${dropped === 1 ? "it was" : "they were"} left out of the report.`
    );
  }

  // Out of the brand-relevant survivors, keep every platform represented and report 20.
  const final = [];
  PLATFORMS.forEach((platform) => {
    survivors
      .filter((entry) => entry.post.platform === platform)
      .slice(0, 4)
      .forEach((entry) => {
        if (!final.includes(entry)) final.push(entry);
      });
  });
  survivors.forEach((entry) => {
    if (final.length < TOP_N && !final.includes(entry)) final.push(entry);
  });
  const kept = final.slice(0, TOP_N).sort((a, b) => rankScore(b.post) - rankScore(a.post));

  // Trend is measured against the posts actually reported, not the raw pull.
  const medianVelocity = medianOf(kept.map(({ post }) => velocityOf(post)));

  const posts = kept.map(({ post, row }, index) => {
    const sentiment = SENTIMENTS.includes(row?.sentiment) ? row.sentiment : "neutral";
    return {
      rank: index + 1,
      platform: post.platform,
      title: post.title,
      excerpt: post.excerpt,
      author: post.author,
      community: post.community,
      url: post.url || "",
      engagement: post.engagement,
      comments: post.comments,
      views: post.views,
      shares: post.shares || 0,
      retweets: post.retweets || 0,
      reposts: post.reposts || 0,
      published_at: post.published_at,
      trend: trendOf(post, medianVelocity),
      sentiment,
      sentiment_score: row ? clampScore(row.score, sentiment) : 0,
      sentiment_reason: row?.reason ? String(row.reason).slice(0, 160) : "Not scored",
      sentiment_evidence: row?.evidence ? String(row.evidence).slice(0, 240) : "",
    };
  });

  if (!posts.length) {
    return { ok: false, error: `Nothing in the pull was actually about ${brief.brand}.` };
  }

  const counts = posts.reduce(
    (acc, post) => ({ ...acc, [post.sentiment]: acc[post.sentiment] + 1 }),
    { positive: 0, neutral: 0, negative: 0 }
  );
  const avg = posts.reduce((sum, post) => sum + post.sentiment_score, 0) / posts.length;

  return {
    ok: true,
    pending: false,
    posts,
    counts,
    avg,
    themes: analysis?.themes || [],
    summary: analysis?.summary || "",
    recommendation: analysis?.recommendation || "",
    trending_topics: (analysis?.trending_topics || []).slice(0, 10).map((topic) => ({
      topic: String(topic.topic || "").slice(0, 90),
      mentions: Math.min(Number(topic.mentions) || 0, posts.length),
      sentiment: ["positive", "neutral", "negative"].includes(topic.sentiment) ? topic.sentiment : "neutral",
    })),
    totalScraped: pool.length,
    warnings,
  };
}

// Step 1 of the public check: read the brand out of the chat and start the scrapes.
export async function startPublicAnalysis({ base44, messages }) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "Visitor" : "Desk"}: ${message.content}`)
    .join("\n");

  const extracted = await base44.integrations.Core.InvokeLLM({
    prompt: extractPrompt(transcript),
    response_json_schema: BRIEF_SCHEMA,
    model: "gemini_3_flash",
  });

  const brief = {
    brand: String(extracted?.brand || "").trim().slice(0, 80),
    category: String(extracted?.category || "").trim().slice(0, 120),
    search: String(extracted?.search || "").trim().slice(0, 90),
    competitors: (extracted?.competitors || []).slice(0, 3).map((name) => String(name).slice(0, 60)),
    goal: String(extracted?.goal || "").trim().slice(0, 300),
  };
  if (!brief.brand) return { ok: false, needBrand: true };

  const { runs, warnings } = await startScrapes({
    brief,
    platforms: PLATFORMS,
    maxItems: PUBLIC_MAX_ITEMS,
    days: PUBLIC_DAYS,
  });

  if (!runs.length) return { ok: false, error: warnings[0] || `No public posts turned up for ${brief.brand}.` };

  return { ok: true, stage: "scraping", brief, runs, warnings };
}

// Step 2: called until every started run has finished, then ranked, scored and saved
// as a Research record with its Post rows.
export async function readPublicAnalysis({ base44, brief, runs, elapsedMs = 0 }) {
  const step = await collectAndScore({ base44, brief, runs, days: PUBLIC_DAYS, elapsedMs });
  if (step.pending) return { ok: true, stage: "scraping", pending: step.pendingPlatforms };
  if (!step.ok) return { ok: false, error: step.error };

  const research = await base44.entities.Research.create({
    brand: brief.brand,
    category: brief.category,
    competitors: brief.competitors.join(", "),
    goal: brief.goal,
    platforms: PLATFORMS,
    status: "complete",
    summary: step.summary,
    themes: step.themes,
    trending_topics: step.trending_topics,
    recommendation: step.recommendation,
    positive_count: step.counts.positive,
    neutral_count: step.counts.neutral,
    negative_count: step.counts.negative,
    avg_sentiment: Number(step.avg.toFixed(2)),
    total_scraped: step.totalScraped,
    warnings: step.warnings,
  });

  if (step.posts.length) {
    await base44.entities.Post.bulkCreate(
      step.posts.map((post) => ({ ...post, research_id: research.id }))
    );
  }

  await base44.entities.ClientFeedback.create({
    name: "Chat visitor",
    topic: "question",
    status: "new",
    message: `Ran a live check on ${brief.brand} from the shared chat link.`,
  }).catch(() => {});

  return { ok: true, research, posts: step.posts };
}