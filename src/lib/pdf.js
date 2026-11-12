import { jsPDF } from "jspdf";
import { compact, PLATFORM_LABEL } from "@/lib/format";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = [26, 24, 20];
const MUTED = [110, 105, 94];
const ACCENT = [167, 60, 27];
const RULE = [214, 210, 202];

const TONE = {
  positive: [79, 122, 50],
  neutral: [130, 124, 112],
  negative: [179, 63, 32],
};

// The PDF fonts only carry Latin-1, so quotes and dashes are normalised and
// anything outside that range (emoji, CJK) is dropped instead of printed as noise.
const clean = (value) =>
  String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/g, "");

const count = (n) => (Number(n) ? compact(n) : "-");

export function downloadResearchPdf(research, posts = []) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const room = (height) => {
    if (y + height > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const write = (value, opts = {}) => {
    const {
      size = 9.5,
      bold = false,
      color = INK,
      lead = 1.5,
      gap = 4,
      x = MARGIN,
      width = CONTENT_W,
      spacing = 0,
      link,
    } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(clean(value), width);
    const step = size * lead;
    lines.forEach((line) => {
      room(step);
      if (link) doc.textWithLink(line, x, y + size, { url: link });
      else doc.text(line, x, y + size, spacing ? { charSpace: spacing } : {});
      y += step;
    });
    y += gap;
  };

  const heading = (label) => {
    y += 8;
    write(label, { size: 7.5, bold: true, color: MUTED, spacing: 1.3, gap: 7 });
  };

  const rule = (above = 4, below = 8) => {
    y += above;
    room(4);
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += below;
  };

  const positive = Number(research.positive_count) || 0;
  const neutral = Number(research.neutral_count) || 0;
  const negative = Number(research.negative_count) || 0;
  const ranked = positive + neutral + negative;
  const average = Number(research.avg_sentiment) || 0;

  /* ------------------------------------------------------------- header */

  write("SIGNAL DESK", { size: 8, bold: true, color: ACCENT, spacing: 1.8, gap: 12 });
  write(research.brand || "Social listening report", { size: 22, bold: true, lead: 1.25, gap: 6 });

  const meta = [
    (research.created_date || "").slice(0, 10),
    research.category,
    (research.platforms || []).map((platform) => PLATFORM_LABEL[platform] || platform).join(", "),
  ]
    .filter(Boolean)
    .join("   ·   ");
  write(meta, { size: 8.5, color: MUTED, gap: 6 });
  rule(2, 14);

  /* ---------------------------------------------------------- sentiment */

  write(`Sentiment across ${ranked} ranked posts   ·   average ${average > 0 ? "+" : ""}${average.toFixed(2)}`, {
    size: 9,
    color: MUTED,
    gap: 8,
  });

  if (ranked) {
    room(20);
    let x = MARGIN;
    const barTop = y;
    [
      [positive, TONE.positive],
      [neutral, TONE.neutral],
      [negative, TONE.negative],
    ].forEach(([value, colour]) => {
      if (!value) return;
      const width = (value / ranked) * CONTENT_W;
      doc.setFillColor(colour[0], colour[1], colour[2]);
      doc.rect(x, barTop, width, 9, "F");
      x += width;
    });
    y += 19;
  }

  write(`Positive ${positive}   ·   Neutral ${neutral}   ·   Negative ${negative}`, { size: 9, gap: 4 });

  /* ----------------------------------------------------------- read-out */

  if (research.summary) {
    heading("THE READ-OUT");
    write(research.summary, { size: 10.5, lead: 1.55, gap: 6 });
  }

  if (research.recommendation) {
    heading("RECOMMENDED MOVE");
    write(research.recommendation, { size: 9.5, lead: 1.55, gap: 6 });
  }

  /* ------------------------------------------------------------ topics */

  const topics = research.trending_topics?.length
    ? research.trending_topics
    : (research.themes || []).map((topic) => ({ topic }));

  if (topics.length) {
    heading("TRENDING TOPICS");
    topics.slice(0, 10).forEach((topic, index) => {
      const height = 15;
      room(height);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(String(index + 1).padStart(2, "0"), MARGIN, y + 9);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      const label = doc.splitTextToSize(clean(topic.topic), 300)[0] || "";
      doc.text(label, MARGIN + 26, y + 9);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(topic.mentions ? `${topic.mentions} posts` : "-", MARGIN + 402, y + 9, { align: "right" });
      const tone = TONE[topic.sentiment] || MUTED;
      doc.setTextColor(tone[0], tone[1], tone[2]);
      doc.text(topic.sentiment || "-", PAGE_W - MARGIN, y + 9, { align: "right" });
      y += height;
    });
  }

  /* ------------------------------------------------------------- posts */

  if (posts.length) {
    heading(`TOP ${posts.length} POSTS, RANKED`);

    const colRank = MARGIN;
    const colPlatform = MARGIN + 22;
    const colTitle = MARGIN + 76;
    const colLikes = MARGIN + 300;
    const colComments = MARGIN + 362;
    const colViews = MARGIN + 424;
    const titleWidth = 198;

    room(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text("RANK", colRank, y + 8);
    doc.text("PLATFORM", colPlatform, y + 8);
    doc.text("TOP POST", colTitle, y + 8);
    doc.text("LIKES", colLikes, y + 8, { align: "right" });
    doc.text("COMMENTS", colComments, y + 8, { align: "right" });
    doc.text("VIEWS", colViews, y + 8, { align: "right" });
    doc.text("SENTIMENT", PAGE_W - MARGIN, y + 8, { align: "right" });
    y += 14;
    rule(0, 6);

    posts.forEach((post) => {
      const titleLines = doc
        .splitTextToSize(clean(post.title || "Untitled post"), titleWidth)
        .slice(0, 2);
      const metaLine = [post.community || post.author, (post.published_at || "").slice(0, 10)]
        .filter(Boolean)
        .join("  ·  ");
      const height = titleLines.length * 11 + (metaLine ? 22 : 10);
      room(height + 6);
      const top = y;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(String(post.rank ?? "").padStart(2, "0"), colRank, top + 9);

      doc.setFontSize(6.8);
      doc.text(String(PLATFORM_LABEL[post.platform] || post.platform || "").toUpperCase(), colPlatform, top + 9);

      doc.setFontSize(9);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      titleLines.forEach((line, index) => {
        const baseline = top + 9 + index * 11;
        if (post.url) doc.textWithLink(line, colTitle, baseline, { url: post.url });
        else doc.text(line, colTitle, baseline);
      });

      if (metaLine) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(clean(metaLine), colTitle, top + 9 + titleLines.length * 11);
      }

      doc.setFontSize(8.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(count(post.engagement), colLikes, top + 9, { align: "right" });
      doc.text(count(post.comments), colComments, top + 9, { align: "right" });
      doc.text(count(post.views), colViews, top + 9, { align: "right" });

      const tone = TONE[post.sentiment] || MUTED;
      doc.setFontSize(7.5);
      doc.setTextColor(tone[0], tone[1], tone[2]);
      const score = Number(post.sentiment_score) || 0;
      doc.text(`${post.sentiment || "-"} ${score > 0 ? "+" : ""}${score.toFixed(2)}`, PAGE_W - MARGIN, top + 9, {
        align: "right",
      });

      y = top + height;
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 4;
    });
  }

  /* ------------------------------------------------------------ footer */

  y += 10;
  write(
    `${Number(research.total_scraped) || 0} posts read   ·   prepared with MarketPulse AI`,
    { size: 7.5, color: MUTED, gap: 2 }
  );
  (research.warnings || []).slice(0, 3).forEach((warning) => {
    write(warning, { size: 7.5, color: MUTED, gap: 2 });
  });

  const name = `${research.brand || "signal-desk"} social listening ${(research.created_date || "").slice(0, 10)}`
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  doc.save(`${name || "signal-desk report"}.pdf`);
}