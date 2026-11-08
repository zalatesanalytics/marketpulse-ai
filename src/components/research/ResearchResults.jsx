import SentimentSplit from "@/components/research/SentimentSplit";
import PostTable from "@/components/research/PostTable";
import TrendingTopics from "@/components/research/TrendingTopics";
import ExportToSheets from "@/components/research/ExportToSheets";

export default function ResearchResults({ research, posts }) {
  const topics = research.trending_topics?.length
    ? research.trending_topics
    : (research.themes || []).map((topic) => ({ topic }));

  return (
    <div className="space-y-6">
      {!!research.warnings?.length && (
        <div className="rounded-lg border border-[hsl(42_70%_80%)] bg-[hsl(42_80%_96%)] px-4 py-3">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[hsl(38_60%_32%)]">Partial run</p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-[hsl(38_45%_30%)]">
            {research.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <ExportToSheets researchId={research.id} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">The read-out</h2>
          <p className="mt-3 font-display text-[24px] leading-[1.3] tracking-[-0.005em]">
            {research.summary || "No summary was generated for this run."}
          </p>
          {research.recommendation && (
            <div className="mt-5 rounded-lg border border-border bg-[hsl(40_28%_96%)] p-4">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Recommended move</p>
              <p className="mt-1.5 text-[13px] leading-relaxed">{research.recommendation}</p>
            </div>
          )}
        </div>

        <div className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Sentiment</h2>
              <span className="font-mono text-[11px] text-muted-foreground">
                {research.avg_sentiment > 0 ? "+" : ""}
                {Number(research.avg_sentiment || 0).toFixed(2)} avg
              </span>
            </div>
            <div className="mt-3">
              <SentimentSplit
                positive={research.positive_count}
                neutral={research.neutral_count}
                negative={research.negative_count}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>{research.total_scraped} posts read</span>
            <span>top {posts.length} ranked</span>
          </div>
        </div>
      </section>

      <TrendingTopics topics={topics} />

      <section className="rounded-xl border border-border bg-card p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-medium">Top {posts.length} posts, ranked</h2>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            by engagement
          </span>
        </div>
        <PostTable posts={posts} />
      </section>
    </div>
  );
}