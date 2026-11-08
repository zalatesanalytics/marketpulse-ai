import { useEffect, useRef } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { getResearch, runResearch } from "@/lib/server-fns";
import RunProgress from "@/components/research/RunProgress";
import ResearchResults from "@/components/research/ResearchResults";
import { PLATFORM_LABEL, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authed/research/$researchId")({
  loader: async ({ params }) => {
    const data = await getResearch({ data: { research_id: params.researchId } });
    if (!data) throw notFound();
    return data;
  },
  component: ResearchPage,
  head: () => ({
    meta: [{ title: "Research run — Signal Desk" }],
  }),
});

function ResearchPage() {
  const { research, posts } = Route.useLoaderData();
  const router = useRouter();
  const run = useServerFn(runResearch);
  const started = useRef(null);

  useEffect(() => {
    if (research.status !== "running" || started.current === research.id) return;
    started.current = research.id;
    run({ data: { research_id: research.id } })
      .catch(() => null)
      .finally(() => router.invalidate());
  }, [research.id, research.status, run, router]);

  const retry = () => {
    started.current = research.id;
    run({ data: { research_id: research.id } })
      .catch(() => null)
      .finally(() => router.invalidate());
  };

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <Link
        to="/history"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All searches
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {formatDate(research.created_date)} · {(research.platforms || []).map((p) => PLATFORM_LABEL[p] || p).join(" · ")}
          </p>
          <h1 className="mt-2 font-display text-[36px] leading-tight tracking-[-0.01em]">{research.brand}</h1>
          {research.category && <p className="mt-1 text-[13px] text-muted-foreground">{research.category}</p>}
        </div>
        <div className="text-right">
          <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            {research.status}
          </span>
          {!!research.estimated_cost_usd && (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              est. ${Number(research.estimated_cost_usd).toFixed(3)} scrape cost
            </p>
          )}
          {research.status === "complete" && (
            <button
              onClick={retry}
              className="mt-2 inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Re-run
            </button>
          )}
        </div>
      </header>

      {research.goal && (
        <blockquote className="mt-6 border-l-2 border-[hsl(14_72%_38%)] pl-4 text-[14px] leading-relaxed text-foreground/80">
          {research.goal}
        </blockquote>
      )}

      <div className="mt-7">
        {research.status === "running" && <RunProgress platforms={research.platforms || []} />}

        {research.status === "failed" && (
          <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
            <p className="font-display text-[24px]">This run didn’t finish.</p>
            <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
              {research.error || "The scrape returned nothing usable."}
            </p>
            <button
              onClick={retry}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-[12.5px] text-background transition-opacity hover:opacity-90"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        )}

        {research.status === "complete" && <ResearchResults research={research} posts={posts} />}
      </div>
    </div>
  );
}