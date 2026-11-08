import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { RATE_PER_ITEM, buildQuery, rankScore, scrapePlatform } from "@/lib/apify.server";

const PER_PLATFORM = 30;
const TOP_N = 20;
const PLATFORM_ENUM = z.enum(["reddit", "x", "youtube"]);

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
    const estimate = data.platforms.reduce((sum, p) => sum + PER_PLATFORM * RATE_PER_ITEM[p], 0);
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
- themes: 3 to 5 recurring themes, max 6 words each
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
    recommendation: { type: "string" },
  },
  required: ["posts", "summary", "themes", "recommendation"],
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
      platforms.map((platform) => scrapePlatform({ platform, query, maxItems: PER_PLATFORM, days: 30 }))
    );

    const warnings = [];
    const seen = new Set();
    const collected = [];

    settled.forEach((result, i) => {
      const platform = platforms[i];
      if (result.status === "fulfilled") {
        result.value.forEach((post) => {
          const key = post.url || `${post.platform}:${post.title}`;
          if (seen.has(key)) return;
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

    const top = collected.sort((a, b) => rankScore(b) - rankScore(a)).slice(0, TOP_N);

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