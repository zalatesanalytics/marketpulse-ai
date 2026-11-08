import { secrets } from "base44:runtime";

// Apify actors used for each platform. Swap an id here to change provider.
const ACTORS = {
  reddit: "apify~reddit-scraper",
  x: "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest",
  youtube: "streamers~youtube-scraper",
};

// Published pay-per-result rates, used only for the pre-run cost estimate.
export const RATE_PER_ITEM = { reddit: 0.0025, x: 0.0009, youtube: 0.0024 };

const timeWindow = (days) => (days <= 1 ? "day" : days <= 7 ? "week" : days <= 31 ? "month" : "year");

const pickNum = (...values) => {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
};

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };

// Strips markup, decodes entities, drops tracking links and collapses whitespace.
const clean = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (match) => ENTITIES[match.toLowerCase()] ?? " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Links must stay intact, so they skip clean(): it deliberately strips URLs.
const pickUrl = (...values) => {
  for (const v of values) {
    if (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim())) return v.trim();
  }
  return "";
};

const pickStr = (...values) => {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return clean(v);
  }
  return "";
};

// Normalizes epoch seconds, epoch millis and date strings to one ISO timestamp.
function toIso(value) {
  if (value === "" || value === null || value === undefined) return "";
  const epoch = typeof value === "number" ? value : /^\d{10,13}$/.test(String(value)) ? Number(value) : null;
  if (epoch) {
    const date = new Date(epoch < 1e12 ? epoch * 1000 : epoch);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

const fieldAt = (item, path) =>
  path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), item);

// Counts live under different keys on each platform; read the right ones first.
const FIELDS = {
  reddit: {
    likes: ["upVotes", "upvoteCount", "score"],
    comments: ["numberOfComments", "commentsCount", "commentCount"],
    views: ["viewCount", "views"],
    shares: ["crosspostCount", "crossposts", "shareCount"],
    community: ["communityName", "subreddit"],
  },
  // Retweets and reposts are only reported by X, so other platforms leave them empty.
  x: {
    likes: ["likeCount", "likes"],
    comments: ["replyCount", "replyCounts", "commentCount"],
    views: ["viewCount", "viewsCount"],
    shares: [],
    retweets: ["retweetCount", "retweets"],
    reposts: ["quoteCount", "repostCount", "reposts"],
    community: ["author.userName", "username", "authorName"],
  },
  youtube: {
    likes: ["likes", "likeCount"],
    comments: ["commentsCount", "commentCount"],
    views: ["viewCount", "views"],
    shares: ["shareCount", "shares"],
    community: ["channelName", "channel.name"],
  },
};

const pickField = (item, paths = []) => {
  for (const path of paths) {
    const num = pickNum(fieldAt(item, path));
    if (num) return num;
  }
  return 0;
};

function buildInput(platform, query, maxItems, days) {
  if (platform === "reddit") {
    return {
      scrapeMode: "posts",
      searchQueries: [query],
      searchSort: "top",
      searchTimeFilter: timeWindow(days),
      maxSearchResultsPerQuery: maxItems,
      includeNsfw: false,
    };
  }
  if (platform === "youtube") {
    return {
      searchQueries: [query],
      maxResults: maxItems,
      sortingOrder: "relevance",
      dateFilter: timeWindow(days),
      transcriptionAndSubtitle: "NONE",
    };
  }
  return { searchTerms: [query], maxItems, queryType: "Top" };
}

function publishedAt(item) {
  const explicit = pickStr(item.createdAt, item.date, item.publishedAt, item.uploadDate, item.created);
  return toIso(explicit || pickNum(item.created_utc, item.createdUtc, item.timestamp));
}

function normalize(platform, item) {
  if (!item || typeof item !== "object") return null;
  const text = pickStr(item.text, item.fullText, item.body, item.description);
  let title = pickStr(item.title, item.postTitle);
  if (!title) title = text.slice(0, 140);
  if (!title) return null;

  const excerpt = platform === "x" ? "" : pickStr(item.body, item.text, item.description);
  const author =
    pickStr(
      item.authorName,
      item.username,
      item.author?.userName,
      item.author?.username,
      item.author?.name,
      item.channelName
    ) || pickStr(item.author);

  let url = pickUrl(item.url, item.link, item.postUrl, item.videoUrl, item.permalink);
  if (!url && platform === "x" && item.id) url = `https://x.com/i/status/${item.id}`;

  const fields = FIELDS[platform] || {};
  const community = pickStr(
    ...(fields.community || []).map((path) => fieldAt(item, path)),
    item.communityName,
    item.subreddit,
    item.channelName,
    item.channel?.name
  );

  const retweets = pickField(item, fields.retweets);
  const reposts = pickField(item, fields.reposts);

  return {
    platform,
    title: title.slice(0, 300),
    excerpt: excerpt.slice(0, 1200),
    author: author.slice(0, 80),
    community: community.slice(0, 80),
    url,
    engagement: pickField(item, fields.likes) || pickNum(item.upVotes, item.upvoteCount, item.likeCount, item.likes, item.score),
    comments:
      pickField(item, fields.comments) ||
      pickNum(item.numberOfComments, item.commentCount, item.commentsCount, item.replyCount),
    views: pickField(item, fields.views) || pickNum(item.viewCount, item.views),
    // X reports retweets and reposts separately; their sum is that platform's share count.
    shares:
      pickField(item, fields.shares) ||
      retweets + reposts ||
      pickNum(item.shareCount, item.crosspostCount, item.shares),
    retweets,
    reposts,
    published_at: publishedAt(item),
  };
}

export const rankScore = (p) => p.engagement + p.comments * 2 + p.views * 0.01;

export async function scrapePlatform({ platform, query, maxItems, days = 30 }) {
  const token = secrets.get("APIFY_TOKEN");
  if (!token) {
    throw Object.assign(
      new Error("Apify is not connected yet. Add your Apify API token to enable scraping."),
      { code: "NO_TOKEN" }
    );
  }

  const controller = new AbortController();
  // Cap each scrape so one slow platform can't hold the whole run.
  const timer = setTimeout(() => controller.abort(), 70000);
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${ACTORS[platform]}/run-sync-get-dataset-items?timeout=60&format=json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildInput(platform, query, maxItems, days)),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${platform} scrape failed (${response.status}). ${detail.slice(0, 240)}`);
    }

    const items = await response.json();
    if (!Array.isArray(items)) throw new Error(`${platform} returned an unexpected response.`);

    return items.map((item) => normalize(platform, item)).filter(Boolean);
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${platform} timed out — try fewer results.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Starts an actor run without waiting, so a visitor request never blocks on the scrape.
export async function startScrape({ platform, query, maxItems, days = 90 }) {
  const token = secrets.get("APIFY_TOKEN");
  if (!token) throw new Error("Apify is not connected yet. Add your Apify API token to enable scraping.");

  const response = await fetch(`https://api.apify.com/v2/acts/${ACTORS[platform]}/runs?timeout=100`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildInput(platform, query, maxItems, days)),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${platform} scrape failed (${response.status}). ${detail.slice(0, 200)}`);
  }

  const payload = await response.json();
  const run = payload?.data;
  if (!run?.id) throw new Error(`${platform} could not be started.`);
  return { platform, runId: run.id };
}

// Reads one started run: still going, failed, or its normalized items.
export async function collectScrape({ platform, runId }) {
  const token = secrets.get("APIFY_TOKEN");
  if (!token) throw new Error("Apify is not connected yet. Add your Apify API token to enable scraping.");

  const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!runResponse.ok) throw new Error(`${platform} run could not be read (${runResponse.status}).`);

  const run = (await runResponse.json())?.data;
  if (!run?.status) throw new Error(`${platform} run could not be read.`);
  if (run.status === "READY" || run.status === "RUNNING") return { platform, pending: true };
  if (run.status !== "SUCCEEDED") {
    return { platform, pending: false, items: [], failed: `${platform} scrape ended ${String(run.status).toLowerCase()}.` };
  }

  const itemsResponse = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!itemsResponse.ok) throw new Error(`${platform} results could not be read (${itemsResponse.status}).`);

  const items = await itemsResponse.json();
  if (!Array.isArray(items)) throw new Error(`${platform} returned an unexpected response.`);
  return { platform, pending: false, items: items.map((item) => normalize(platform, item)).filter(Boolean) };
}

export function buildQuery(brand, competitors) {
  const names = [brand, ...String(competitors || "").split(",")]
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 4);
  return names.length > 1 ? names.join(" OR ") : names[0] || brand;
}