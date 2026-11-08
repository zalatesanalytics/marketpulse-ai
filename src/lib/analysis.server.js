import { buildQuery, collectScrape, rankScore, startScrape } from "@/lib/apify.server";

const TOP_N = 20;
const PLATFORMS = ["reddit", "x", "youtube"];
const PUBLIC_MAX_ITEMS = 20;
const PUBLIC_DAYS = 90;

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string" },
    category: { type: "string" },
    competitors: { type: "array", items: { type: "string" } },
    goal: { type: "string" },
  },
  required: ["brand", "category", "competitors", "goal"],
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
        },
        required: ["index", "sentiment", "score", "reason"],
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
- category: the market category it competes in, otherwise ""
- competitors: up to three competitors they mentioned, otherwise []
- goal: the decision this research would support, one sentence, otherwise ""
Never invent a brand.

CONVERSATION:
${transcript}`;

const scorePrompt = (brief) => `You are a senior social listening analyst. Score the posts below for sentiment toward "${brief.brand}"${
  brief.category ? ` (category: ${brief.category})` : ""
}.
${brief.competitors?.length ? `Competitors in view: ${brief.competitors.join(", ")}.` : ""}
${brief.goal ? `The client needs this to decide: "${brief.goal}"` : ""}

For every numbered post return sentiment (positive | neutral | negative, judged toward ${brief.brand}), score between -1 (hostile) and 1 (advocating), and reason (max 12 words, grounded only in the post text).
Then return:
- summary: 2-3 sentences on what the conversation as a whole says
- trending_topics: the top 10 topics driving the conversation, most discussed first. Each: topic (2 to 5 words, specific to ${brief.brand}), mentions (listed posts that touch it, never a like or comment count), sentiment
- recommendation: 2-3 sentences of concrete next actions

Be strict: praise that is really a complaint is negative.`;

// Starts the platform scrapers without waiting for them, so no request has to hold
// the whole crawl. Returns the run handles to poll.
export async function startScrapes({
  brief,
  platforms = PLATFORMS,
  maxItems = PUBLIC_MAX_ITEMS,
  days = PUBLIC_DAYS,
}) {
  const query = buildQuery(brief.brand, brief.competitors.join(", "));
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
export async function collectAndScore({ base44, brief, runs, days = PUBLIC_DAYS }) {
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

  if (pending.length) return { ok: true, pending: true, pendingPlatforms: pending };
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

  const ranked = [...pool].sort((a, b) => rankScore(b) - rankScore(a));
  // Keep every platform represented, then fill the rest by engagement.
  const selected = [];
  PLATFORMS.forEach((platform) => {
    ranked
      .filter((post) => post.platform === platform)
      .slice(0, 4)
      .forEach((post) => {
        if (!selected.includes(post)) selected.push(post);
      });
  });
  ranked.forEach((post) => {
    if (selected.length < TOP_N && !selected.includes(post)) selected.push(post);
  });
  const top = selected.slice(0, TOP_N).sort((a, b) => rankScore(b) - rankScore(a));

  let analysis = null;
  try {
    const listing = top
      .map((post, index) => {
        const body = (post.excerpt || "").replace(/\s+/g, " ").slice(0, 280);
        return `[${index + 1}] (${post.platform}, ${post.engagement} upvotes/likes) ${post.title}${
          body ? ` — ${body}` : ""
        }`;
      })
      .join("\n");

    analysis = await base44.integrations.Core.InvokeLLM({
      prompt: `${scorePrompt(brief)}\n\nPOSTS:\n${listing}`,
      response_json_schema: SCORE_SCHEMA,
      model: "gemini_3_flash",
    });
  } catch {
    warnings.push("Score failed, so every post is shown as neutral.");
  }

  const scored = new Map();
  (analysis?.posts || []).forEach((row) => {
    if (Number.isInteger(row.index)) scored.set(row.index - 1, row);
  });

  const posts = top.map((post, index) => {
    const row = scored.get(index);
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
      trend: post.trend || "steady",
      sentiment: row?.sentiment || "neutral",
      sentiment_score: typeof row?.score === "number" ? Number(row.score.toFixed(2)) : 0,
      sentiment_reason: row?.reason || "Not scored",
    };
  });

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
export async function readPublicAnalysis({ base44, brief, runs }) {
  const step = await collectAndScore({ base44, brief, runs, days: PUBLIC_DAYS });
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