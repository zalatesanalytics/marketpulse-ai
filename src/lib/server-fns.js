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

/* ------------------------------------------------------------ gdocs */

const docEsc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const DOC_COLORS = { positive: "#6f9a48", neutral: "#bdb7ac", negative: "#c05a33" };

// A proportion bar built from coloured table cells: Drive's HTML import keeps it,
// and it reads as a chart inside the finished document.
const sentimentBarHtml = (positive, neutral, negative) => {
  const total = positive + neutral + negative || 1;
  const cells = [
    ["positive", positive],
    ["neutral", neutral],
    ["negative", negative],
  ]
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const width = Math.max(Math.round((count / total) * 100), 3);
      return `<td width="${width}%" style="background-color:${DOC_COLORS[key]};height:16px;font-size:1px;line-height:1px">&nbsp;</td>`;
    })
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 10px"><tr>${cells}</tr></table>`;
};

const CELL = 'style="border:1px solid #d8d4cc;padding:6px 8px;font-size:9.5pt;vertical-align:top"';
const HEAD = 'style="border:1px solid #d8d4cc;padding:6px 8px;font-size:8.5pt;letter-spacing:0.05em;color:#6e695e;background-color:#f4f1ea"';

const docHtml = (research, posts) => {
  const positive = Number(research.positive_count) || 0;
  const neutral = Number(research.neutral_count) || 0;
  const negative = Number(research.negative_count) || 0;
  const ranked = positive + neutral + negative;
  const avg = Number(research.avg_sentiment) || 0;
  const share = (count) => (ranked ? `${Math.round((count / ranked) * 100)}%` : "—");
  const topics = research.trending_topics?.length
    ? research.trending_topics
    : (research.themes || []).map((topic) => ({ topic }));

  const topicRows = topics
    .slice(0, 10)
    .map(
      (topic, i) =>
        `<tr><td ${CELL}>${i + 1}</td><td ${CELL}>${docEsc(topic.topic)}</td><td ${CELL}>${
          topic.mentions ? `${topic.mentions} posts` : "—"
        }</td><td ${CELL}>${docEsc(topic.sentiment || "—")}</td></tr>`
    )
    .join("");

  const postRows = posts
    .map(
      (post) => `<tr>
        <td ${CELL}>${post.rank ?? ""}</td>
        <td ${CELL}>${docEsc(String(post.platform || "").toUpperCase())}</td>
        <td ${CELL}>${post.url ? `<a href="${docEsc(post.url)}">${docEsc(post.title)}</a>` : docEsc(post.title)}</td>
        <td ${CELL}>${Number(post.engagement) || 0}</td>
        <td ${CELL}>${Number(post.comments) || 0}</td>
        <td ${CELL}>${Number(post.views) || 0}</td>
        <td ${CELL}>${docEsc(post.sentiment || "—")} ${(Number(post.sentiment_score) || 0).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `<html><head><meta charset="utf-8"><style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.55; color: #1a1814; }
    h1 { font-size: 24pt; font-weight: normal; margin: 0 0 4px; }
    h2 { font-size: 12pt; margin: 22px 0 8px; color: #a73c1b; }
    p { margin: 0 0 8px; }
    a { color: #a73c1b; }
    .meta { color: #6e695e; font-size: 9.5pt; }
  </style></head><body>
    <h1>${docEsc(research.brand)} — social listening</h1>
    <p class="meta">${docEsc(
      [
        new Date(research.created_date || Date.now()).toISOString().slice(0, 10),
        (research.platforms || []).join(", "),
        research.category,
      ]
        .filter(Boolean)
        .join(" · ")
    )}</p>

    <h2>The read-out</h2>
    <p>${docEsc(research.summary || "No summary was generated for this run.")}</p>

    ${research.recommendation ? `<h2>Recommended move</h2><p>${docEsc(research.recommendation)}</p>` : ""}

    <h2>Sentiment chart</h2>
    <p class="meta">${ranked} posts ranked · average score ${avg > 0 ? "+" : ""}${avg.toFixed(
      2
    )} (from -1 hostile to +1 advocating)</p>
    ${sentimentBarHtml(positive, neutral, negative)}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr><td ${HEAD}>Sentiment</td><td ${HEAD}>Posts</td><td ${HEAD}>Share</td></tr>
      <tr><td ${CELL}>Positive</td><td ${CELL}>${positive}</td><td ${CELL}>${share(positive)}</td></tr>
      <tr><td ${CELL}>Neutral</td><td ${CELL}>${neutral}</td><td ${CELL}>${share(neutral)}</td></tr>
      <tr><td ${CELL}>Negative</td><td ${CELL}>${negative}</td><td ${CELL}>${share(negative)}</td></tr>
    </table>

    ${
      topicRows
        ? `<h2>Trending topics</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr><td ${HEAD}>#</td><td ${HEAD}>Topic</td><td ${HEAD}>Volume</td><td ${HEAD}>Sentiment</td></tr>
      ${topicRows}
    </table>`
        : ""
    }

    <h2>Top ${posts.length} posts, ranked</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr><td ${HEAD}>#</td><td ${HEAD}>Platform</td><td ${HEAD}>Post</td><td ${HEAD}>Likes</td><td ${HEAD}>Comments</td><td ${HEAD}>Views</td><td ${HEAD}>Sentiment</td></tr>
      ${postRows}
    </table>

    <p class="meta" style="margin-top:22px">${Number(research.total_scraped) || 0} posts read · prepared with MarketPulse AI</p>
  </body></html>`;
};

export const exportResearchToDoc = createServerFn({ method: "POST" })
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

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getConnection("googledocs"));
    } catch {
      return { ok: false, error: "Google Docs is not connected yet. Approve the connection, then export again." };
    }

    const boundary = `signaldesk_${Date.now().toString(36)}`;
    const metadata = {
      name: `${research.brand} — social listening ${new Date().toISOString().slice(0, 10)}`,
      mimeType: "application/vnd.google-apps.document",
    };
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      docHtml(research, page.items),
      `--${boundary}--`,
    ].join("\r\n");

    const upload = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!upload.ok) {
      const detail = await upload.text();
      return { ok: false, error: `Google Docs refused the export (${upload.status}). ${detail.slice(0, 160)}` };
    }

    const { id } = await upload.json();
    return { ok: true, url: `https://docs.google.com/document/d/${id}/edit` };
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