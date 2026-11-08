import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SERIES_COLORS = [
  "hsl(14 72% 38%)",
  "hsl(88 24% 40%)",
  "hsl(200 30% 42%)",
  "hsl(42 70% 52%)",
  "hsl(40 8% 45%)",
];

const dayKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const dayLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const score = (value) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}`;

export default function SentimentTrendChart({ runs = [] }) {
  const scored = runs
    .filter((run) => run && run.brand && dayKey(run.created_date))
    .map((run) => ({ ...run, day: dayKey(run.created_date), value: Number(run.avg_sentiment) || 0 }));

  if (!scored.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">
        Trends appear once you have completed runs to compare.
      </p>
    );
  }

  // Five brands keep the lines readable; the busiest ones come first.
  const tallies = scored.reduce((counts, run) => {
    counts[run.brand] = (counts[run.brand] || 0) + 1;
    return counts;
  }, {});
  const brands = Object.keys(tallies)
    .sort((a, b) => tallies[b] - tallies[a] || a.localeCompare(b))
    .slice(0, 5);

  const days = [...new Set(scored.map((run) => run.day))].sort();

  // One row per day; a brand with two runs that day is averaged so its line stays honest.
  const data = days.map((day) => {
    const row = { day };
    brands.forEach((brand) => {
      const values = scored.filter((run) => run.day === day && run.brand === brand).map((run) => run.value);
      if (values.length) row[brand] = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
    });
    return row;
  });

  return (
    <div className="w-full" style={{ height: 270 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 10.5, fill: "hsl(var(--muted-foreground))" }}
            minTickGap={12}
          />
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          <Tooltip
            labelFormatter={dayLabel}
            formatter={(value, name) => [score(value), name]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              fontSize: 11.5,
              padding: "8px 10px",
            }}
            labelStyle={{ fontFamily: "monospace", fontSize: 10, color: "hsl(var(--muted-foreground))" }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          />
          {brands.map((brand, index) => (
            <Line
              key={brand}
              type="monotone"
              dataKey={brand}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: SERIES_COLORS[index % SERIES_COLORS.length] }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}