const TONES = {
  positive: {
    label: "Leaning positive",
    surface: "bg-[hsl(88_32%_95%)] border-[hsl(88_24%_84%)] text-[hsl(88_32%_26%)]",
  },
  neutral: {
    label: "Evenly split",
    surface: "bg-[hsl(40_16%_96%)] border-[hsl(40_14%_86%)] text-[hsl(40_10%_30%)]",
  },
  negative: {
    label: "Leaning negative",
    surface: "bg-[hsl(14_60%_96%)] border-[hsl(14_50%_87%)] text-[hsl(14_62%_34%)]",
  },
};

// Turns the scored posts into the one-line answer: is the room positive, negative or split?
export default function SentimentVerdict({ positive = 0, neutral = 0, negative = 0, avg = 0 }) {
  const total = positive + neutral + negative;
  if (!total) return null;

  const net = (positive - negative) / total;
  const tone = TONES[net >= 0.2 ? "positive" : net <= -0.2 ? "negative" : "neutral"];

  const top = Math.max(positive, neutral, negative);
  const lead = positive === top ? "positive" : negative === top ? "negative" : "neutral";

  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border px-3 py-2 ${tone.surface}`}>
      <p className="text-[12.5px] font-medium">{tone.label}</p>
      <p className="text-[11.5px] opacity-80">
        {top} of {total} posts read {lead} · avg score {avg > 0 ? "+" : ""}
        {Number(avg || 0).toFixed(2)}
      </p>
    </div>
  );
}