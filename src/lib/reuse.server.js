const DAY = 86400000;

// A saved sample answers new questions about the same subject for this long before the
// desk pays for a fresh crawl.
export const REUSE_DAYS = 14;

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isFresh = (record, days = REUSE_DAYS) => {
  const time = Date.parse(record.collected_at || record.created_date || "");
  return !Number.isNaN(time) && Date.now() - time <= days * DAY;
};

// One key per category + region + brand set, so the same question asked a week later
// finds the sample it already paid for.
export const sampleKey = ({ category, region, brands }) =>
  [normalize(category), normalize(region), [...(brands || [])].map(normalize).sort().join(" ")]
    .filter(Boolean)
    .join("|")
    .slice(0, 180);

export async function findSavedSample({ base44, key }) {
  const page = await base44.entities.Sample.filter({ key }, { sort: "-created_date", limit: 5 });
  return page.items.find((item) => isFresh(item) && (item.posts || []).length) || null;
}

export async function saveSample({ base44, key, brief, posts, researchId = "" }) {
  const stored = posts.slice(0, 30).map((post) => ({
    platform: post.platform,
    title: String(post.title || "").slice(0, 220),
    excerpt: String(post.excerpt || "").slice(0, 400),
    author: post.author || "",
    community: post.community || "",
    url: post.url || "",
    engagement: Number(post.engagement) || 0,
    comments: Number(post.comments) || 0,
    views: Number(post.views) || 0,
    shares: Number(post.shares) || 0,
    published_at: post.published_at || "",
  }));

  await base44.entities.Sample.deleteMany({ key });
  return base44.entities.Sample.create({
    key,
    label: `${brief.category}${brief.region ? ` · ${brief.region}` : ""}`.slice(0, 120),
    category: brief.category,
    region: brief.region || "",
    search: brief.search || "",
    brands: brief.brands || [],
    platforms: [...new Set(stored.map((post) => post.platform))],
    window_days: brief.windowDays || 30,
    posts: stored,
    posts_count: stored.length,
    research_id: researchId,
    collected_at: new Date().toISOString(),
  });
}

// A brand already read recently needs no second crawl: its posts and scored report are
// saved on the Research record.
export async function findFreshResearch({ base44, brand }) {
  const target = normalize(brand);
  if (!target) return null;

  const page = await base44.entities.Research.filter(
    { status: "complete" },
    { sort: "-created_date", limit: 30 }
  );
  return page.items.find((item) => normalize(item.brand) === target && isFresh(item)) || null;
}