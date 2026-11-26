import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ANSWER_SCHEMA as CATEGORY_ANSWER_SCHEMA,
  buildCategoryPrompt,
  mentionsBrand,
  readCategorySample,
  resolveCategory,
  startCategoryScrapes,
  tallyBrands,
} from "@/lib/category.server";
import { collectAndScore } from "@/lib/analysis.server";
import { findSavedSample, sampleKey, saveSample } from "@/lib/reuse.server";

// Same question, same key: a saved answer comes back instead of a second scrape.
const keyOf = (question) =>
  String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 160);

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    points: { type: "array", items: { type: "string" } },
    post_ids: { type: "array", items: { type: "number" } },
  },
  required: ["answer", "points", "post_ids"],
};

const CATEGORY_LABEL = {
  trend: "trend detection",
  sentiment: "sentiment tracking",
  community: "community discovery",
  competitive: "competitive mapping",
};

const day = (value) => String(value || "").slice(0, 10);

const buildPrompt = ({ question, category, research, posts }) => {
  const positive = Number(research.positive_count) || 0;
  const neutral = Number(research.neutral_count) || 0;
  const negative = Number(research.negative_count) || 0;
  const avg = Number(research.avg_sentiment) || 0;

  const dates = posts
    .map((post) => day(post.published_at))
    .filter(Boolean)
    .sort();

  const tally = {};
  posts.forEach((post) => {
    const name = post.community || post.author;
    if (name) tally[name] = (tally[name] || 0) + 1;
  });
  const communities = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");

  const topics = (research.trending_topics || [])
    .map((topic) => `${topic.topic} (${Number(topic.mentions) || 0} posts, ${topic.sentiment || "neutral"})`)
    .join("; ");

  const digest = posts
    .map((post, index) => {
      const meta = [
        post.platform,
        post.community || post.author,
        day(post.published_at) || "undated",
        `sentiment ${post.sentiment || "neutral"} (${(Number(post.sentiment_score) || 0).toFixed(2)})`,
        `${Number(post.engagement) || 0} likes`,
        `${Number(post.comments) || 0} comments`,
      ]
        .filter(Boolean)
        .join(" · ");
      const body = String(post.excerpt || "").replace(/\s+/g, " ").slice(0, 260);
      return `[${index + 1}] ${meta}\n${post.title}\n${body}`;
    })
    .join("\n\n");

  return `You are the analyst on Signal Desk's data-quality desk. A client asked one question from a scraper quality test. Answer it strictly from the sample below.

QUESTION (${CATEGORY_LABEL[category] || "general"}): "${question}"

THE SAMPLE — a real scrape of Reddit, X and YouTube from the past 90 days:
brand: ${research.brand || "not stated"}
category: ${research.category || "not stated"}
competitors on the query: ${research.competitors || "none"}
posts ranked: ${posts.length} of ${Number(research.total_scraped) || posts.length} read
sentiment: ${positive} positive, ${neutral} neutral, ${negative} negative; average score ${avg.toFixed(2)}
post dates: ${dates[0] || "unknown"} to ${dates[dates.length - 1] || "unknown"}
sample collected: ${day(research.created_date) || "unknown"}
top communities: ${communities || "not reported by these platforms"}
detected topics: ${topics || "none detected"}

POSTS
${digest}

Write the answer.
- 2 to 4 sentences of plain conversational English. No headings, no markdown, no bullet lists inside "answer".
- Use only numbers that appear above. Never invent a statistic, a city split, a time window or a platform that was not read.
- If the sample cannot support part of the question (a different period such as a previous quarter or last year, a location split, a platform like Instagram or TikTok that was not scraped, a private group or Discord), say that plainly in one sentence, then say what the sample does show. That honesty is the point of this test.
- "points": up to 4 short factual observations drawn from the posts above, each under 14 words.
- "post_ids": the 2 or 3 post numbers from the list above that best support the answer.`;
};

export const lookupQualityAnswer = createServerFn({ method: "POST" })
  .validator(z.object({ question: z.string().min(4).max(400) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44().asServiceRole;
    const page = await base44.entities.QualityAnswer.filter(
      { question_key: keyOf(data.question) },
      { limit: 1 }
    );
    const hit = page.items[0];
    if (!hit) return { found: false };
    return { found: true, answer: hit };
  });

// Public on purpose: the quality test is a shareable link, like the report.
// One bounded LLM call per question, and the result is saved so a repeat is free.
export const answerQualityQuestion = createServerFn({ method: "POST" })
  .validator(
    z.object({
      question: z.string().min(4).max(400),
      category: z.string().max(24).optional().default(""),
      research_id: z.string().min(1).max(64),
    })
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44().asServiceRole;

    const research = await base44.entities.Research.get(data.research_id).catch((error) => {
      if (error?.status === 404) return null;
      throw error;
    });
    if (!research || research.status !== "complete") {
      return { ok: false, error: "That run is not ready to read yet." };
    }

    const page = await base44.entities.Post.filter(
      { research_id: research.id },
      { sort: "rank", limit: 20 }
    );
    const posts = page.items;
    if (!posts.length) return { ok: false, error: "That run came back without posts to read." };

    const out = await base44.integrations.Core.InvokeLLM({
      prompt: buildPrompt({ question: data.question, category: data.category, research, posts }),
      response_json_schema: ANSWER_SCHEMA,
      model: "gemini_3_flash",
    });

    const text = String(out?.answer || "").trim() || research.summary || "";
    const points = (out?.points || [])
      .map((point) => String(point || "").slice(0, 130))
      .filter(Boolean)
      .slice(0, 4);

    const picked = Array.isArray(out?.post_ids)
      ? out.post_ids
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= posts.length)
      : [];
    const evidence = [...new Set(picked)].slice(0, 3).map((n) => {
      const post = posts[n - 1];
      return {
        title: String(post.title || "").slice(0, 150),
        platform: post.platform || "",
        url: post.url || "",
        sentiment: post.sentiment || "neutral",
      };
    });

    const record = {
      question_key: keyOf(data.question),
      question: data.question.slice(0, 400),
      category: data.category || "",
      answer: text,
      points,
      evidence,
      research_id: research.id,
      brand: research.brand || "",
      posts_read: posts.length,
      platforms: research.platforms || [],
    };

    const existing = await base44.entities.QualityAnswer.filter(
      { question_key: record.question_key },
      { limit: 1 }
    );
    const saved = existing.items[0]
      ? await base44.entities.QualityAnswer.update(existing.items[0].id, record)
      : await base44.entities.QualityAnswer.create(record);

    return { ok: true, answer: saved };
  });

/* ------------------------------------------------------- category reads */

const CategoryBriefInput = z.object({
  category: z.string().min(2).max(80),
  region: z.string().max(60).optional().default(""),
  search: z.string().min(2).max(90),
  brands: z.array(z.string().min(1).max(40)).min(2).max(5),
  goal: z.string().max(240).optional().default(""),
  windowDays: z.number().min(7).max(90),
});

const RunsInput = z
  .array(z.object({ platform: z.enum(["reddit", "x", "youtube"]), runId: z.string().min(1).max(80) }))
  .min(1)
  .max(3);

// No brand was named, so the desk works out the category, the brands that compete in it
// and the search phrase itself before crawling — a category question gets an answer
// instead of a request for a brand.
export const startCategoryRead = createServerFn({ method: "POST" })
  .validator(z.object({ question: z.string().min(4).max(400) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44().asServiceRole;
    const brief = await resolveCategory({ base44, question: data.question });
    if (!brief) return { ok: false, unclear: true };

    // This category was read recently: answer from the saved posts, no crawl.
    const saved = await findSavedSample({ base44, key: sampleKey(brief) });
    if (saved) {
      return {
        ok: true,
        reused: true,
        sample_id: saved.id,
        brief: {
          category: saved.category,
          region: saved.region || "",
          search: saved.search || saved.category,
          brands: saved.brands?.length ? saved.brands : brief.brands,
          goal: brief.goal,
          windowDays: Number(saved.window_days) || brief.windowDays,
        },
      };
    }

    const { runs, warnings } = await startCategoryScrapes({ brief });
    if (!runs.length) {
      return { ok: false, error: warnings[0] || "No public posts turned up for that category." };
    }
    return { ok: true, brief, runs, warnings };
  });

// Polled until the crawls land, then brand mentions are counted and the answer written.
export const readCategoryAnswer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      question: z.string().min(4).max(400),
      category: z.string().max(24).optional().default(""),
      brief: CategoryBriefInput,
      runs: RunsInput.optional().default([]),
      sample_id: z.string().max(64).optional().default(""),
      elapsedMs: z.number().min(0).max(600000).optional().default(0),
    })
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44().asServiceRole;

    let posts = [];
    let reused = false;
    let savedResearchId = "";

    if (data.sample_id) {
      const saved = await base44.entities.Sample.get(data.sample_id).catch((error) => {
        if (error?.status === 404) return null;
        throw error;
      });
      if (!saved || !(saved.posts || []).length) {
        return { ok: false, error: "That saved sample is gone. Ask again and I'll read it fresh." };
      }
      posts = saved.posts;
      savedResearchId = saved.research_id || "";
      reused = true;
    } else {
      const sample = await readCategorySample({
        brief: data.brief,
        runs: data.runs,
        elapsedMs: data.elapsedMs,
      });
      if (sample.pending) return { ok: true, stage: "scraping" };
      posts = sample.posts;
    }

    if (!posts.length) {
      return { ok: false, error: "Nothing came back for that search. Try naming the category differently." };
    }

    const { ranked, matching } = tallyBrands(posts, data.brief.brands);
    if (!ranked[0].posts) {
      return { ok: false, error: `The posts that came back never named ${data.brief.brands.join(", ")}.` };
    }

    const digestPosts = posts
      .filter((post) =>
        ranked.some((entry) => mentionsBrand(`${post.title} ${post.excerpt}`, entry.brand))
      )
      .slice(0, 12);

    const digest = digestPosts
      .map((post, index) => {
        const meta = [
          post.platform,
          post.community || post.author,
          day(post.published_at) || "undated",
          `${Number(post.engagement) || 0} likes`,
        ]
          .filter(Boolean)
          .join(" · ");
        return `[${index + 1}] ${meta}\n${post.title}\n${String(post.excerpt || "")
          .replace(/\s+/g, " ")
          .slice(0, 200)}`;
      })
      .join("\n\n");

    const out = await base44.integrations.Core.InvokeLLM({
      prompt: buildCategoryPrompt({
        question: data.question,
        brief: data.brief,
        posts,
        ranked,
        matching,
        digest,
      }),
      response_json_schema: CATEGORY_ANSWER_SCHEMA,
      model: "gemini_3_flash",
    });

    const picked = Array.isArray(out?.post_ids)
      ? out.post_ids
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= digestPosts.length)
      : [];

    const evidence = [...new Set(picked)].slice(0, 3).map((n) => {
      const post = digestPosts[n - 1];
      return {
        title: String(post.title || "").slice(0, 150),
        platform: post.platform || "",
        url: post.url || "",
        sentiment: "",
      };
    });

    const points = ranked
      .slice(0, 3)
      .map((entry) => `${entry.brand}: named in ${entry.posts} of ${matching} posts`);
    points.push(
      `${data.brief.region ? `${data.brief.region} · ` : ""}last ${data.brief.windowDays} days · ${posts.length} posts pulled`
    );

    const text =
      String(out?.answer || "").trim() ||
      `${ranked[0].brand} is the most discussed of ${data.brief.brands.join(", ")} in this sample, with ${
        ranked[0].posts
      } of ${matching} posts.`;

    // The category answer keeps the full ranked read behind it too: the leading brand's
    // top 20 posts, scored for sentiment, saved as a normal report.
    const leader = ranked[0];
    let researchId = savedResearchId;

    // A reused sample already carries its report, so only a fresh read builds one.
    if (!reused) {
      const step = await collectAndScore({
        base44,
        brief: {
          brand: leader.brand,
          category: data.brief.region ? `${data.brief.category} (${data.brief.region})` : data.brief.category,
          competitors: data.brief.brands.filter((brand) => brand !== leader.brand).slice(0, 3),
          goal: data.question,
          search: "",
        },
        runs: data.runs,
        days: data.brief.windowDays,
      });

      if (step.ok && !step.pending && step.posts.length) {
        const research = await base44.entities.Research.create({
          brand: leader.brand,
          category: data.brief.region ? `${data.brief.category} (${data.brief.region})` : data.brief.category,
          competitors: data.brief.brands.filter((brand) => brand !== leader.brand).join(", "),
          goal: data.question,
          platforms: [...new Set(step.posts.map((post) => post.platform))],
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

        await base44.entities.Post.bulkCreate(
          step.posts.map((post) => ({ ...post, research_id: research.id }))
        );
        researchId = research.id;
      }

      // Keep the posts, so the next question about this category costs no crawl.
      await saveSample({
        base44,
        key: sampleKey(data.brief),
        brief: data.brief,
        posts,
        researchId,
      });
    }

    const record = {
      question_key: keyOf(data.question),
      question: data.question.slice(0, 400),
      category: data.category || "",
      answer: text,
      points,
      evidence,
      research_id: researchId,
      brand: ranked[0].brand,
      posts_read: posts.length,
      platforms: [...new Set(posts.map((post) => post.platform))],
    };

    const existing = await base44.entities.QualityAnswer.filter(
      { question_key: record.question_key },
      { limit: 1 }
    );
    const saved = existing.items[0]
      ? await base44.entities.QualityAnswer.update(existing.items[0].id, record)
      : await base44.entities.QualityAnswer.create(record);

    return { ok: true, answer: saved };
  });