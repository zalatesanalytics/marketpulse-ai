import { buildQuery, rankScore, scrapePlatform } from "@/lib/apify.server";

const TOP_N = 20;
const MAX_ITEMS = 20;
const PLATFORMS = ["reddit", "x", "youtube"];

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

// Reads the live public conversation for one brand and ranks the top 20 posts.
// Runs with a service-role client so it can score and log without a signed-in visitor.
export async function runPublicAnalysis({ base44, messages }) {
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

  const query = buildQuery(brief.brand, brief.competitors.join(", "));
  const settled = await Promise.allSettled(
    PLATFORMS.map((platform) => scrapePlatform({ platform, query, maxItems: MAX_ITEMS, days: 90 }))
  );

  const warnings = [];
  const seen = new Set();
  const collected = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      result.value.forEach((post) => {
        const key = post.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60) || post.url;
        if (!key || seen.has(key)) return;
        seen.add(key);
        collected.push(post);
      });
    } else {
      warnings.push(result.reason?.message || `${PLATFORMS[index]} could not be read.`);
    }
  });

  if (!collected.length) {
    return { ok: false, error: warnings[0] || `No public posts turned up for ${brief.brand}.` };
  }

  // Reddit and YouTube only offer day/week/month/year windows, so keep the last 90 days here.
  const cutoff = Date.now() - 90 * 86400000;
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
      author: post.author,
      community: post.community,
      url: post.url,
      engagement: post.engagement,
      comments: post.comments,
      views: post.views,
      published_at: post.published_at,
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

  const research = {
    id: `public-${Date.now()}`,
    brand: brief.brand,
    category: brief.category,
    competitors: brief.competitors.join(", "),
    goal: brief.goal,
    platforms: PLATFORMS,
    summary: analysis?.summary || "",
    recommendation: analysis?.recommendation || "",
    trending_topics: (analysis?.trending_topics || []).slice(0, 10).map((topic) => ({
      topic: String(topic.topic || "").slice(0, 90),
      mentions: Math.min(Number(topic.mentions) || 0, posts.length),
      sentiment: ["positive", "neutral", "negative"].includes(topic.sentiment) ? topic.sentiment : "neutral",
    })),
    positive_count: counts.positive,
    neutral_count: counts.neutral,
    negative_count: counts.negative,
    avg_sentiment: Number(avg.toFixed(2)),
    total_scraped: pool.length,
    warnings,
    created_date: new Date().toISOString(),
  };

  await base44.entities.ClientFeedback
    .create({
      name: "Chat visitor",
      topic: "question",
      status: "new",
      message: `Ran a live check on ${brief.brand} from the shared chat link.`,
    })
    .catch(() => {});

  return { ok: true, research, posts };
}