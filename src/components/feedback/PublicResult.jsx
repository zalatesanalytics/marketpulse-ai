import SentimentChip from "@/components/research/SentimentChip";
import SentimentSplit from "@/components/research/SentimentSplit";
import TrendingTopics from "@/components/research/TrendingTopics";
import PostTable from "@/components/research/PostTable";
import DownloadExcel from "@/components/research/DownloadExcel";
import { compact, PLATFORM_LABEL } from "@/lib/format";

export default function PublicResult({ research, posts, format }) {
  const topics = research.trending_topics || [];
  const full = format !== "dashboard";

  return (
    <article className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Signal Desk result</p>
          <p className="mt-0.5 text-[15px] font-medium">
            {research.brand}
            {research.category && <span className="text-muted-foreground"> · {research.category}</span>}
          </p>
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
          {research.total_scraped} read · top {posts.length}
        </span>
      </div>

      <div className="space-y-4 p-4">
        {research.summary && (
          <p className="font-display text-[19px] leading-[1.35] tracking-[-0.005em]">{research.summary}</p>
        )}

        <div>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Sentiment</p>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {research.avg_sentiment > 0 ? "+" : ""}
              {Number(research.avg_sentiment || 0).toFixed(2)} avg
            </span>
          </div>
          <div className="mt-2">
            <SentimentSplit
              positive={research.positive_count}
              neutral={research.neutral_count}
              negative={research.negative_count}
            />
          </div>
        </div>

        {research.recommendation && (
          <div className="rounded-lg border border-border bg-[hsl(40_28%_96%)] p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Recommended move</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed">{research.recommendation}</p>
          </div>
        )}

        <TrendingTopics topics={topics} />

        {full ? (
          <div className="border-t border-border pt-3">
            <PostTable posts={posts} />
          </div>
        ) : (
          <ul className="divide-y divide-border/60 border-t border-border pt-1">
            {posts.slice(0, 5).map((post) => (
              <li key={post.rank} className="flex items-start gap-2 py-2">
                <span className="mt-0.5 font-mono text-[9.5px] text-muted-foreground/70">
                  {String(post.rank).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block text-[12.5px] leading-snug underline-offset-2 hover:underline"
                  >
                    {post.title}
                  </a>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    {[PLATFORM_LABEL[post.platform] || post.platform, compact(post.engagement), "likes"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <SentimentChip sentiment={post.sentiment} className="shrink-0 whitespace-nowrap" />
              </li>
            ))}
          </ul>
        )}

        {format === "excel" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Two sheets: the analysis table and the recommendation.
            </p>
            <DownloadExcel research={research} posts={posts} />
          </div>
        )}

        {!!research.warnings?.length && (
          <p className="text-[11px] leading-relaxed text-[hsl(38_45%_32%)]">{research.warnings[0]}</p>
        )}
      </div>
    </article>
  );
}