import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = {
  positive: "hsl(88 34% 46%)",
  neutral: "hsl(40 10% 72%)",
  negative: "hsl(14 62% 48%)",
};

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <p className="text-[11.5px] font-medium">{point.label}</p>
      <p className="font-mono text-[10.5px] text-muted-foreground">
        {point.value} {point.value === 1 ? "post" : "posts"} · {point.share}% of ranked
      </p>
    </div>
  );
}

export default function SentimentBarChart({ positive = 0, neutral = 0, negative = 0, height = 230 }) {
  const total = (Number(positive) || 0) + (Number(neutral) || 0) + (Number(negative) || 0);

  const data = [
    { label: "Positive", key: "positive", value: Number(positive) || 0 },
    { label: "Neutral", key: "neutral", value: Number(neutral) || 0 },
    { label: "Negative", key: "negative", value: Number(negative) || 0 },
  ].map((bar) => ({
    ...bar,
    fill: COLORS[bar.key],
    share: total ? Math.round((bar.value / total) * 100) : 0,
  }));

  if (!total) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">
        Sentiment bars appear once the first run has scored its posts.
      </p>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: -20 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip cursor={{ fill: "hsl(var(--secondary))" }} content={<ChartTip />} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={84}>
            <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
            {data.map((bar) => (
              <Cell key={bar.key} fill={bar.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}