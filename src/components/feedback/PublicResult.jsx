import SentimentSplit from "@/components/research/SentimentSplit";
import TrendingTopics from "@/components/research/TrendingTopics";
import PostTable from "@/components/research/PostTable";
import DownloadExcel from "@/components/research/DownloadExcel";

export default function PublicResult({ research, posts }) {
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

        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SentimentSplit
              positive={research.positive_count}
              neutral={research.neutral_count}
              negative={research.negative_count}
            />
          </div>
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
            {research.avg_sentiment > 0 ? "+" : ""}
            {Number(research.avg_sentiment || 0).toFixed(2)} avg
          </span>
        </div>

        {research.recommendation && (
          <div className="rounded-lg border border-border bg-[hsl(40_28%_96%)] p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Recommended move</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed">{research.recommendation}</p>
          </div>
        )}

        <TrendingTopics topics={research.trending_topics || []} />

        <div className="border-t border-border pt-3">
          <PostTable posts={posts} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Every post with its likes, comments, views and score.
          </p>
          <DownloadExcel research={research} posts={posts} />
        </div>

        {!!research.warnings?.length && (
          <p className="text-[11px] leading-relaxed text-[hsl(38_45%_32%)]">{research.warnings[0]}</p>
        )}
      </div>
    </article>
  );
}