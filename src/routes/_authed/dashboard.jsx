import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { listResearch } from "@/lib/server-fns";
import SentimentSplit from "@/components/research/SentimentSplit";
import SentimentBarChart from "@/components/research/SentimentBarChart";
import { PLATFORM_LABEL, compact, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authed/dashboard")({
  loader: async () => await listResearch(),
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — Signal Desk" },
      { name: "description", content: "Every brand listening run in one overview, with the sentiment split across them." },
    ],
  }),
});

const sum = (runs, field) => runs.reduce((total, run) => total + (Number(run[field]) || 0), 0);

function DashboardPage() {
  const runs = Route.useLoaderData();
  const complete = runs.filter((run) => run.status === "complete");

  const positive = sum(runs, "positive_count");
  const neutral = sum(runs, "neutral_count");
  const negative = sum(runs, "negative_count");
  const ranked = positive + neutral + negative;
  const avg = complete.length ? sum(complete, "avg_sentiment") / complete.length : 0;

  const stats = [
    { label: "Runs", value: runs.length, note: `${complete.length} complete` },
    { label: "Posts read", value: compact(sum(runs, "total_scraped")), note: "across every run" },
    { label: "Posts ranked", value: compact(ranked), note: "scored for sentiment" },
    {
      label: "Avg sentiment",
      value: `${avg > 0 ? "+" : ""}${avg.toFixed(2)}`,
      note: "−1 hostile to +1 advocating",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Dashboard</p>
          <h1 className="mt-2 font-display text-[34px] leading-tight tracking-[-0.01em]">Every run at a glance</h1>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-[12.5px] text-background transition-opacity hover:opacity-90"
        >
          New research <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {runs.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-display text-[24px]">No numbers to read yet.</p>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-muted-foreground">
            Your first completed run fills this overview with sentiment totals and its recommendation.
          </p>
          <Link to="/" className="mt-5 inline-block rounded-md border border-border px-4 py-2 text-[12.5px] hover:bg-card">
            Start a research
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{stat.label}</p>
                <p className="mt-2 font-display text-[28px] leading-none tracking-[-0.01em]">{stat.value}</p>
                <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{stat.note}</p>
              </div>
            ))}
          </section>

          <section className="mt-4 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Sentiment across the top posts
              </h2>
              <p className="font-mono text-[10px] text-muted-foreground">
                {positive} positive · {neutral} neutral · {negative} negative
              </p>
            </div>
            <div className="mt-2">
              <SentimentBarChart positive={positive} neutral={neutral} negative={negative} />
            </div>
            <p className="border-t border-border/60 pt-3 text-[10.5px] leading-relaxed text-muted-foreground">
              Every ranked post from your completed runs, grouped by the sentiment the desk scored it with: positive,
              neutral or negative.
            </p>
          </section>

          <section className="mt-4 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-[13px] font-medium">All runs</h2>
              <Link
                to="/history"
                className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Full archive
              </Link>
            </div>
            <ul className="divide-y divide-border/60">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    to="/research/$researchId"
                    params={{ researchId: run.id }}
                    className="group grid gap-2.5 px-5 py-4 transition-colors hover:bg-secondary/40 md:grid-cols-[minmax(0,1fr)_170px_auto] md:items-center md:gap-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{run.brand}</p>
                      <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                        {formatDate(run.created_date)} ·{" "}
                        {(run.platforms || []).map((p) => PLATFORM_LABEL[p] || p).join(" · ")}
                        {run.status !== "complete" && (
                          <span className="text-[hsl(14_62%_42%)]"> · {run.status}</span>
                        )}
                      </p>
                      {run.recommendation && (
                        <p className="mt-1 line-clamp-1 text-[11.5px] text-muted-foreground">{run.recommendation}</p>
                      )}
                    </div>

                    <div className="md:w-[170px]">
                      <SentimentSplit
                        positive={run.positive_count}
                        neutral={run.neutral_count}
                        negative={run.negative_count}
                        showLegend={false}
                      />
                      <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">
                        {Number(run.total_scraped) || 0} read ·{" "}
                        {(Number(run.positive_count) || 0) +
                          (Number(run.neutral_count) || 0) +
                          (Number(run.negative_count) || 0)}{" "}
                        ranked
                      </p>
                    </div>

                    <ArrowUpRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 md:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}