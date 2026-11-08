import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { RATE_PER_ITEM } from "@/lib/apify.server";
import { collectAndScore, startScrapes } from "@/lib/analysis.server";

// Fewer items per platform keeps a run fast; with more platforms each fetches less
// so the pool still fills the top 20.
const perPlatform = (count) => (count <= 1 ? 20 : count === 2 ? 16 : 12);
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

const PLATFORMS = ["reddit", "x", "youtube"];

const briefOf = (research) => ({
  brand: research.brand,
  category: research.category || "",
  competitors: String(research.competitors || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 3),
  goal: research.goal || "",
});

const loadOwned = async (base44, researchId, user) => {
  const research = await base44.entities.Research.get(researchId).catch((error) => {
    if (error?.status === 404) return null;
    throw error;
  });
  if (!research) return { error: "This research run no longer exists." };
  if (research.created_by_id && research.created_by_id !== user.id) {
    return { error: "Only the person who started this research can run it." };
  }
  return { research };
};

// Step 1: start the Reddit, X and YouTube scrapers and remember their run ids on the
// record, so the request returns in a couple of seconds instead of holding the crawl.
export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ research_id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const { research, error } = await loadOwned(base44, data.research_id, context.user);
    if (error) return { ok: false, error };

    const started = Array.isArray(research.scraper_runs) ? research.scraper_runs : [];
    if (research.status === "running" && started.length) return { ok: true, stage: "scraping" };

    const platforms = (research.platforms || []).filter((platform) => PLATFORMS.includes(platform));
    if (!platforms.length) return { ok: false, error: "Pick at least one platform first." };

    const researchId = research.id;
    await base44.entities.Research.update(researchId, {
      status: "running",
      error: "",
      warnings: [],
      scraper_runs: [],
      summary: "",
      recommendation: "",
      trending_topics: [],
    });
    await base44.entities.Post.deleteMany({ research_id: researchId });

    const { runs, warnings } = await startScrapes({
      brief: briefOf(research),
      platforms,
      maxItems: perPlatform(platforms.length),
      days: 30,
    });

    if (!runs.length) {
      const failure = warnings[0] || "No public posts were found for that query.";
      await base44.entities.Research.update(researchId, { status: "failed", error: failure, warnings });
      return { ok: false, error: failure };
    }

    await base44.entities.Research.update(researchId, {
      scraper_runs: runs.map((run) => ({ platform: run.platform, run_id: run.runId })),
      warnings,
    });

    return { ok: true, stage: "scraping", warnings };
  });

// Step 2: called until every started run has finished. Ranks the top 20, scores
// sentiment and saves the posts plus the read-out onto the research record.
export const finishResearch = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ research_id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const { research, error } = await loadOwned(base44, data.research_id, context.user);
    if (error) return { ok: false, error };

    const runs = (research.scraper_runs || [])
      .filter((run) => run?.run_id && PLATFORMS.includes(run.platform))
      .map((run) => ({ platform: run.platform, runId: run.run_id }));
    if (!runs.length) return { ok: false, error: "This run was never started. Try again." };

    const researchId = research.id;
    const step = await collectAndScore({ base44, brief: briefOf(research), runs, days: 30 });
    if (step.pending) return { ok: true, stage: "scraping" };

    if (!step.ok) {
      await base44.entities.Research.update(researchId, {
        status: "failed",
        error: step.error,
        scraper_runs: [],
      });
      return { ok: false, error: step.error };
    }

    await base44.entities.Post.deleteMany({ research_id: researchId });
    if (step.posts.length) {
      await base44.entities.Post.bulkCreate(
        step.posts.map((post) => ({ ...post, research_id: researchId }))
      );
    }

    await base44.entities.Research.update(researchId, {
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
      scraper_runs: [],
      error: "",
    });

    return { ok: true, stage: "done", warnings: step.warnings };
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

const CHAT_SYSTEM = `You are the Signal Desk assistant, on the desk's public chat. The visitor is a brand marketer testing the tool, and nobody is signed in.
Signal Desk scrapes public posts on Reddit, X and YouTube, ranks the top 20 by engagement, scores each one's sentiment and sentiment score, and reports trending topics plus a recommended next move.
Help the visitor frame what to research: which questions are worth asking, which platforms to start with, how to read sentiment, trending topics and rising versus cooling posts.
If they ask how to run a study, describe the intake: brand, category, competitors, the decision it supports, and the platforms.
Keep every reply under 100 words, plain conversational language, no markdown headings or bullet lists longer than three items. Never invent statistics, never claim you browsed a platform, and never promise a report exists. The moment they name a brand or product, the page below the chat pulls the top 20 posts from the past 90 days, ranked with their dates, reactions, comments and sentiment. Say that is happening instead of asking them to choose a format or a view. Never say you already pulled results yourself, and never invent numbers.
If they want a human, say the research desk replies by email to notes left on this page.`;

// Deliberately public: the shared link opens a chat with no account. Each exchange is
// saved as a client note so the desk can read what visitors asked.
export const chatWithDesk = createServerFn({ method: "POST" })
  .validator(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(2000),
          })
        )
        .min(1)
        .max(16),
    })
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44().asServiceRole;
    const transcript = data.messages
      .map((message) => `${message.role === "user" ? "Visitor" : "Desk"}: ${message.content}`)
      .join("\n");

    const reply = await base44.integrations.Core.InvokeLLM({
      prompt: `${CHAT_SYSTEM}\n\nCONVERSATION:\n${transcript}\n\nReply as the Desk, to the visitor:`,
      model: "gemini_3_flash",
    });

    const question = [...data.messages].reverse().find((message) => message.role === "user");
    if (question) {
      await base44.entities.ClientFeedback.create({
        name: "Chat visitor",
        topic: "question",
        status: "new",
        message: `Visitor: ${question.content}\n\nDesk: ${String(reply || "").trim()}`,
      }).catch(() => {});
    }

    return { reply: String(reply || "").trim() };
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