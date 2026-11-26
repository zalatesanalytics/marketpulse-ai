import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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