import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { RATE_PER_ITEM, buildQuery, rankScore, scrapePlatform } from "@/lib/apify.server";

const TOP_N = 20;
// Fewer items per platform keeps a run fast; with more platforms each fetches less
// so the pool still fills the top 20.
const perPlatform = (count) => (count <= 1 ? 20 : count === 2 ? 16 : 12);
const PLATFORM_ENUM = z.enum(["reddit", "x", "youtube"]);

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Trend compares a post's engagement per day against the rest of the run.
const assignTrend = (posts) => {
  const now = Date.now();
  const velocities = posts.map((post) => {
    const time = Date.parse(post.published_at || "");
    if (Number.isNaN(time)) return null;
    const ageDays = Math.max((now - time) / 86400000, 0.5);
    return rankScore(post) / ageDays;
  });
  const baseline = median(velocities.filter((v) => v !== null)) || 0;

  return posts.map((post, i) => {
    const velocity = velocities[i];
    if (velocity === null || !baseline) return { ...post, trend: "steady" };
    const ratio = velocity / baseline;
    return { ...post, trend: ratio >= 1.5 ? "rising" : ratio <= 0.6 ? "cooling" : "steady" };
  });
};

/* ---------------------------------------------------------------- reads */

export const listResearch = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const page = await context.getBase44().entities.Research.list({ sort: "-created_date", limit: 60 });
    return page.items;
  });

export const getResearch = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ research_id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const research = await base44.entities.Research.get(data.research_id).catch((error) => {
      if (error?.status === 404) return null;
      throw error;
    });
    if (!research) return null;

    const posts = await base44.entities.Post.filter(
      { research_id: data.research_id },
      { sort: "rank", limit: 50 }
    );
    return { research, posts: posts.items };
  });

export const deleteResearch = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ research_id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    await base44.entities.Post.deleteMany({ research_id: data.research_id });
    await base44.entities.Research.delete(data.research_id);
    return { ok: true };
  });

/* --------------------------------------------------------------- create */

export const createResearch = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      brand: z.string().min(1).max(120),
      category: z.string().max(200).optional().default(""),
      competitors: z.string().max(300).optional().default(""),
      goal: z.string().max(800).optional().default(""),
      platforms: z.array(PLATFORM_ENUM).min(1).max(3),
    })
  )
  .handler(async ({ data, context }) => {
    const estimate = data.platforms.reduce((sum, p) => sum + perPlatform(data.platforms.length) * RATE_PER_ITEM[p], 0);
    return context.getBase44().entities.Research.create({
      ...data,
      status: "running",
      positive_count: 0,
      neutral_count: 0,
      negative_count: 0,
      avg_sentiment: 0,
      total_scraped: 0,
      estimated_cost_usd: Number(estimate.toFixed(4)),
      warnings: [],
    });
  });

/* ------------------------------------------------------------------ run */

const SYSTEM_PROMPT = (research) => `You are a senior social listening analyst. Score the posts below for sentiment toward "${research.brand}"${
  research.category ? ` (category: ${research.category})` : ""
}.
${research.competitors ? `Competitors in view: ${research.competitors}.` : ""}
${research.goal ? `The client needs this to decide: "${research.goal}"` : ""}

For every numbered post return:
- sentiment: positive | neutral | negative, judged toward ${research.brand}
- score: between -1 (hostile) and 1 (advocating)
- reason: max 12 words, grounded only in the post text

Then return:
- summary: 2-3 sentences on what the conversation as a whole says
- trending_topics: exactly the top 10 topics driving the conversation, ordered from most to least discussed. For each: topic (2 to 5 words, specific to ${research.brand} and its category, never generic like "discussion"), mentions (count of the listed posts that genuinely touch it, never more than the number of posts listed and never a like or comment count), sentiment (dominant tone of that topic)
- recommendation: 2-3 sentences of concrete next actions, tied to the client's decision

Be strict: praise that is really a complaint ("great, another delay") is negative.`;

const RESPONSE_SCHEMA = {
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
  required: ["posts", "summary", "themes", "trending_topics", "recommendation"],
};

export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ research_id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const research = await base44.entities.Research.get(data.research_id).catch((error) => {
      if (error?.status === 404) return null;
      throw error;
    });
    if (!research) return { ok: false, error: "This research run no longer exists." };
    if (research.created_by_id && research.created_by_id !== context.user.id) {
      return { ok: false, error: "Only the person who started this research can run it." };
    }

    const researchId = data.research_id;
    await base44.entities.Research.update(researchId, { status: "running", error: "", warnings: [] });
    await base44.entities.Post.deleteMany({ research_id: researchId });

    const query = buildQuery(research.brand, research.competitors);
    const platforms = (research.platforms || []).filter((p) => ["reddit", "x", "youtube"].includes(p));

    const settled = await Promise.allSettled(
      platforms.map((platform) =>
        scrapePlatform({ platform, query, maxItems: perPlatform(platforms.length), days: 30 })
      )
    );

    const warnings = [];
    const seen = new Set();
    const collected = [];

    settled.forEach((result, i) => {
      const platform = platforms[i];
      if (result.status === "fulfilled") {
        result.value.forEach((post) => {
          const titleKey = post.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
          const key = titleKey || post.url;
          if (!key || seen.has(key)) return;
          seen.add(key);
          collected.push(post);
        });
      } else {
        warnings.push(result.reason?.message || `${platform} could not be scraped.`);
      }
    });

    if (!collected.length) {
      await base44.entities.Research.update(researchId, {
        status: "failed",
        error: warnings[0] || "No public posts were found for that query.",
        warnings,
        total_scraped: 0,
      });
      return { ok: false, error: warnings[0] || "No public posts were found for that query." };
    }

    const top = assignTrend(collected.sort((a, b) => rankScore(b) - rankScore(a)).slice(0, TOP_N));

    let analysis = null;
    try {
      const listing = top
        .map((p, i) => {
          const body = (p.excerpt || "").replace(/\s+/g, " ").slice(0, 320);
          return `[${i + 1}] (${p.platform}, ${p.engagement} upvotes/likes, ${p.comments} comments) ${p.title}${
            body ? ` — ${body}` : ""
          }`;
        })
        .join("\n");

      analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `${SYSTEM_PROMPT(research)}\n\nPOSTS:\n${listing}`,
        response_json_schema: RESPONSE_SCHEMA,
        model: "gemini_3_flash",
      });
    } catch (error) {
      warnings.push("Sentiment scoring failed for this run.");
    }

    const scored = new Map();
    (analysis?.posts || []).forEach((row) => {
      if (Number.isInteger(row.index)) scored.set(row.index - 1, row);
    });

    const rows = top.map((post, i) => {
      const row = scored.get(i);
      return {
        research_id: researchId,
        platform: post.platform,
        rank: i + 1,
        title: post.title,
        excerpt: post.excerpt,
        author: post.author,
        community: post.community,
        url: post.url,
        engagement: post.engagement,
        comments: post.comments,
        views: post.views,
        published_at: post.published_at,
        trend: post.trend,
        sentiment: row?.sentiment || "neutral",
        sentiment_score: typeof row?.score === "number" ? Number(row.score.toFixed(2)) : 0,
        sentiment_reason: row?.reason || "Not scored",
      };
    });

    await base44.entities.Post.bulkCreate(rows);

    const counts = rows.reduce(
      (acc, r) => ({ ...acc, [r.sentiment]: acc[r.sentiment] + 1 }),
      { positive: 0, neutral: 0, negative: 0 }
    );
    const avg = rows.length
      ? rows.reduce((sum, r) => sum + r.sentiment_score, 0) / rows.length
      : 0;

    await base44.entities.Research.update(researchId, {
      status: "complete",
      summary: analysis?.summary || "",
      themes: analysis?.themes || [],
      trending_topics: (analysis?.trending_topics || []).slice(0, 10).map((topic) => ({
        topic: String(topic.topic || "").slice(0, 90),
        mentions: Math.min(Number(topic.mentions) || 0, top.length),
        sentiment: ["positive", "neutral", "negative"].includes(topic.sentiment) ? topic.sentiment : "neutral",
      })),
      recommendation: analysis?.recommendation || "",
      positive_count: counts.positive,
      neutral_count: counts.neutral,
      negative_count: counts.negative,
      avg_sentiment: Number(avg.toFixed(2)),
      total_scraped: collected.length,
      warnings,
      error: "",
    });

    return { ok: true };
  });

/* --------------------------------------------------------------- sheets */

export const exportResearchToSheets = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ research_id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const research = await base44.entities.Research.get(data.research_id).catch((error) => {
      if (error?.status === 404) return null;
      throw error;
    });
    if (!research) return { ok: false, error: "This research run no longer exists." };
    if (research.status !== "complete") return { ok: false, error: "Finish the run before exporting it." };

    const page = await base44.entities.Post.filter({ research_id: research.id }, { sort: "rank", limit: 50 });
    const posts = page.items;

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets"));
    } catch {
      return { ok: false, error: "Google Sheets is not connected yet. Approve the connection, then export again." };
    }

    const created = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: { title: `${research.brand} — social listening ${new Date().toISOString().slice(0, 10)}` },
        sheets: [{ properties: { title: "Ranking" } }, { properties: { title: "Trend report" } }],
      }),
    });
    if (!created.ok) return { ok: false, error: `Google Sheets refused the export (${created.status}).` };
    const { spreadsheetId } = await created.json();

    const ranking = [
      ["Rank", "Platform", "Title", "Author", "Community", "Likes", "Comments", "Views", "Trend", "Sentiment", "Score", "Posted", "URL"],
      ...posts.map((p) => [
        p.rank ?? "",
        p.platform || "",
        p.title || "",
        p.author || "",
        p.community || "",
        Number(p.engagement) || 0,
        Number(p.comments) || 0,
        Number(p.views) || 0,
        p.trend || "",
        p.sentiment || "",
        Number(p.sentiment_score) || 0,
        p.published_at ? String(p.published_at).slice(0, 10) : "",
        p.url || "",
      ]),
    ];

    const topics = research.trending_topics?.length
      ? research.trending_topics
      : (research.themes || []).map((topic) => ({ topic }));

    const report = [
      ["Signal Desk — trend report"],
      ["Brand", research.brand || ""],
      ["Category", research.category || ""],
      ["Competitors", research.competitors || ""],
      ["Decision supported", research.goal || ""],
      ["Platforms", (research.platforms || []).join(", ")],
      ["Posts read", Number(research.total_scraped) || 0],
      ["Ranked", posts.length],
      [],
      ["Sentiment", "Count"],
      ["Positive", Number(research.positive_count) || 0],
      ["Neutral", Number(research.neutral_count) || 0],
      ["Negative", Number(research.negative_count) || 0],
      ["Average score", Number(research.avg_sentiment) || 0],
      [],
      ["What the conversation says"],
      [research.summary || ""],
      [],
      ["Recommended move"],
      [research.recommendation || ""],
      [],
      ["Top topics", "Mentions", "Sentiment"],
      ...topics.map((t) => [t.topic || "", Number(t.mentions) || "", t.sentiment || ""]),
    ];

    const written = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: [
            { range: "Ranking!A1", values: ranking },
            { range: "Trend report!A1", values: report },
          ],
        }),
      }
    );
    if (!written.ok) return { ok: false, error: `The spreadsheet could not be written to (${written.status}).` };

    return { ok: true, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
  });

/* --------------------------------------------------------- client notes */

// Deliberately public: the shared link is how a client reaches the desk without an account.
export const submitClientFeedback = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1).max(80),
      email: z.string().max(160).optional().default(""),
      company: z.string().max(120).optional().default(""),
      topic: z.enum(["feedback", "bug", "question"]).default("feedback"),
      message: z.string().min(2).max(4000),
    })
  )
  .handler(async ({ data, context }) => {
    await context.getBase44().entities.ClientFeedback.create({ ...data, status: "new" });
    return { ok: true };
  });

export const listClientFeedback = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const page = await context.getBase44().entities.ClientFeedback.list({ sort: "-created_date", limit: 100 });
    return page.items;
  });

export const setClientFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string().min(1), status: z.enum(["new", "done"]) }))
  .handler(async ({ data, context }) => {
    await context.getBase44().entities.ClientFeedback.update(data.id, { status: data.status });
    return { ok: true };
  });

export const deleteClientFeedback = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await context.getBase44().entities.ClientFeedback.delete(data.id);
    return { ok: true };
  });