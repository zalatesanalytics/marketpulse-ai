import SentimentChip from "@/components/research/SentimentChip";

const SAMPLE = [
  { platform: "reddit", title: "Switched from Java House to Aria — the subscription actually saves me money", meta: "r/Kenya · 412 upvotes · 96 comments", sentiment: "positive", score: 0.71 },
  { platform: "youtube", title: "Honest review: is a coffee subscription worth it in Nairobi?", meta: "YouTube · 38k views · 214 comments", sentiment: "neutral", score: 0.04 },
  { platform: "x", title: "Third week in a row my Aria order arrived late. Same excuse every time.", meta: "X · 1.2k likes · 143 replies", sentiment: "negative", score: -0.62 },
];

export default function SampleRunPreview() {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-medium">What a run returns</h2>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          Sample
        </span>
      </header>
      <ul className="divide-y divide-border">
        {SAMPLE.map((p, i) => (
          <li key={i} className="px-4 py-3">
            <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="text-foreground/60">#{i + 1}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              {p.platform}
            </div>
            <p className="mt-1.5 text-[13px] leading-snug">{p.title}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] text-muted-foreground">{p.meta}</span>
              <SentimentChip sentiment={p.sentiment} score={p.score} />
            </div>
          </li>
        ))}
      </ul>
      <footer className="border-t border-border px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
        Every run is saved, so you can compare this month’s sentiment with last month’s.
      </footer>
    </section>
  );
}