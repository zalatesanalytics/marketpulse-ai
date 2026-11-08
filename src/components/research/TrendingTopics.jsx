import SentimentChip from "@/components/research/SentimentChip";

export default function TrendingTopics({ topics = [] }) {
  if (!topics.length) return null;
  const max = Math.max(...topics.map((t) => t.mentions || 0), 1);

  return (
    <section className="rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-medium">Top 10 trending topics</h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          by volume of discussion
        </span>
      </div>

      <ol className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
        {topics.slice(0, 10).map((item, i) => (
          <li key={`${item.topic}-${i}`} className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-x-2.5">
            <span className="pt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(item.topic)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={`Open pages about ${item.topic}`}
                  className="group/link flex min-w-0 items-baseline gap-1 text-[13px] underline-offset-2 hover:text-primary hover:underline"
                >
                  <span className="truncate">{item.topic}</span>
                  <span aria-hidden="true" className="shrink-0 font-mono text-[9px] text-muted-foreground group-hover/link:text-primary">
                    ↗
                  </span>
                </a>
                <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">
                  {item.mentions ? `${item.mentions} posts` : ""}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-[hsl(88_26%_46%)]"
                    style={{ width: `${Math.max(((item.mentions || 0) / max) * 100, 6)}%` }}
                  />
                </div>
                <SentimentChip sentiment={item.sentiment || "neutral"} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}