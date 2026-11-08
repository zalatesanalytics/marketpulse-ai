import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { listResearch } from "@/lib/server-fns";
import SentimentSplit from "@/components/research/SentimentSplit";
import { PLATFORM_LABEL, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authed/history")({
  loader: async () => await listResearch(),
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "History — Signal Desk" },
      { name: "description", content: "Every brand listening run you have completed, with its sentiment split." },
    ],
  }),
});

function HistoryPage() {
  const runs = Route.useLoaderData();

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Archive</p>
          <h1 className="mt-2 font-display text-[34px] leading-tight tracking-[-0.01em]">Previous searches</h1>
        </div>
        <Link
          to="/new"
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-[12.5px] text-background transition-opacity hover:opacity-90"
        >
          New research <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {runs.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-display text-[24px]">Nothing filed yet.</p>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-muted-foreground">
            Start your first run and it will be stored here with its full evidence trail.
          </p>
          <Link to="/new" className="mt-5 inline-block rounded-md border border-border px-4 py-2 text-[12.5px] hover:bg-card">
            Start a research
          </Link>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                to="/research/$researchId"
                params={{ researchId: run.id }}
                className="group grid gap-3 py-5 transition-colors hover:bg-card/60 md:grid-cols-[minmax(0,1fr)_190px_auto] md:items-center md:gap-6 md:px-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatDate(run.created_date)}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>{(run.platforms || []).map((p) => PLATFORM_LABEL[p] || p).join(" · ")}</span>
                    {run.status !== "complete" && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span className="text-[hsl(14_62%_42%)]">{run.status}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[15px] font-medium">{run.brand}</p>
                  <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">
                    {run.summary || run.goal || run.category || "No summary recorded."}
                  </p>
                </div>

                <div className="md:w-[190px]">
                  <SentimentSplit
                    positive={run.positive_count}
                    neutral={run.neutral_count}
                    negative={run.negative_count}
                    showLegend={false}
                  />
                  <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                    {run.total_scraped || 0} read · {run.positive_count + run.neutral_count + run.negative_count} ranked
                  </p>
                </div>

                <ArrowUpRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 md:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}