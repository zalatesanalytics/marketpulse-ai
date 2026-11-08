const STYLES = {
  positive: "bg-[hsl(88_32%_92%)] text-[hsl(88_32%_26%)] border-[hsl(88_24%_82%)]",
  neutral: "bg-[hsl(40_16%_93%)] text-[hsl(40_10%_34%)] border-[hsl(40_14%_85%)]",
  negative: "bg-[hsl(14_60%_94%)] text-[hsl(14_62%_36%)] border-[hsl(14_50%_86%)]",
};

export default function SentimentChip({ sentiment = "neutral", score, className = "" }) {
  const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLES[sentiment] || STYLES.neutral} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
      {typeof score === "number" && (
        <span className="font-mono text-[10px] opacity-70">{score > 0 ? "+" : ""}{score.toFixed(2)}</span>
      )}
    </span>
  );
}