const SEGMENTS = [
  { key: "positive", label: "Positive", className: "bg-[hsl(88_34%_46%)]" },
  { key: "neutral", label: "Neutral", className: "bg-[hsl(40_10%_72%)]" },
  { key: "negative", label: "Negative", className: "bg-[hsl(14_62%_48%)]" },
];

export default function SentimentSplit({ positive = 0, neutral = 0, negative = 0, showLegend = true }) {
  const counts = { positive, neutral, negative };
  const total = positive + neutral + negative || 1;

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
        {SEGMENTS.map((s) =>
          counts[s.key] ? (
            <div
              key={s.key}
              className={`${s.className} h-full transition-all duration-700`}
              style={{ width: `${(counts[s.key] / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      {showLegend && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${s.className}`} />
              {s.label} {counts[s.key]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}