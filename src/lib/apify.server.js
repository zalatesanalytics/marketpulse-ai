import { secrets } from "base44:runtime";

// Apify actors used for each platform. Swap an id here to change provider.
const ACTORS = {
  reddit: "trudax~reddit-scraper-lite",
  x: "apidojo~tweet-scraper",
  youtube: "streamers~youtube-scraper",
};

// Published pay-per-result rates, used only for the pre-run cost estimate.
export const RATE_PER_ITEM = { reddit: 0.0034, x: 0.0004, youtube: 0.0024 };

const timeWindow = (days) => (days <= 1 ? "day" : days <= 7 ? "week" : days <= 31 ? "month" : "year");

const pickNum = (...values) => {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
};

const pickStr = (...values) => {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
};

function buildInput(platform, query, maxItems, days) {
  if (platform === "reddit") {
    return {
      searches: [query],
      searchPosts: true,
      searchComments: false,
      searchCommunities: false,
      searchUsers: false,
      sort: "top",
      time: timeWindow(days),
      maxItems,
      maxPostCount: maxItems,
      maxComments: 0,
      includeMediaLinks: true,
      skipComments: true,
      includeNSFW: false,
      ignoreStartUrls: true,
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
  return { searchTerms: [query], maxItems, sort: "Top" };
}

function publishedAt(item) {
  const explicit = pickStr(item.createdAt, item.date, item.publishedAt, item.uploadDate, item.created);
  if (explicit) return explicit;
  const epoch = pickNum(item.created_utc, item.createdUtc, item.timestamp);
  return epoch ? new Date(epoch * 1000).toISOString() : "";
}

function normalize(platform, item) {
  if (!item || typeof item !== "object") return null;
  const text = pickStr(item.text, item.fullText, item.body, item.description);
  let title = pickStr(item.title, item.postTitle);
  if (!title) title = text.slice(0, 140);
  if (!title) return null;

  const excerpt = platform === "x" ? "" : pickStr(item.body, item.text, item.description);
  const author =
    pickStr(item.username, item.userName, item.channelName, item.author?.userName, item.author?.name) ||
    pickStr(item.author);

  let url = pickStr(item.url, item.link, item.postUrl, item.videoUrl);
  if (!url && platform === "x" && item.id) url = `https://x.com/i/status/${item.id}`;

  return {
    platform,
    title: title.slice(0, 300),
    excerpt: excerpt.slice(0, 1200),
    author,
    community: pickStr(item.communityName, item.subreddit, item.channelName, item.channel?.name, ""),
    url,
    engagement: pickNum(item.upVotes, item.upvoteCount, item.likeCount, item.likes, item.score),
    comments: pickNum(item.numberOfComments, item.commentCount, item.commentsCount, item.replyCount),
    views: pickNum(item.viewCount, item.views),
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
  const timer = setTimeout(() => controller.abort(), 170000);
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${ACTORS[platform]}/run-sync-get-dataset-items?timeout=160&format=json`,
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

export function buildQuery(brand, competitors) {
  const names = [brand, ...String(competitors || "").split(",")]
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 4);
  return names.length > 1 ? names.join(" OR ") : names[0] || brand;
}