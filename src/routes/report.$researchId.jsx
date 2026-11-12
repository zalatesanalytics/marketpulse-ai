import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Radar } from "lucide-react";
import { getPublicReport } from "@/lib/server-fns";
import PublicResult from "@/components/feedback/PublicResult";
import { PLATFORM_LABEL, formatDate } from "@/lib/format";

export const Route = createFileRoute("/report/$researchId")({
  loader: async ({ params }) => {
    const data = await getPublicReport({ data: { research_id: params.researchId } });
    if (!data) throw notFound();
    return data;
  },
  component: ReportPage,
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.research?.brand || "Research"} — Signal Desk` },
      {
        name: "description",
        content: loaderData?.research?.summary || "A Signal Desk social listening read-out.",
      },
    ],
  }),
});

function ReportPage() {
  const { research, posts } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-5 md:py-14">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
              <Radar className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-medium tracking-tight">Signal Desk</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Run your own read
          </Link>
        </div>

        <header className="mt-6">
          <h1 className="font-display text-[30px] leading-[1.1] tracking-[-0.01em] md:text-[36px]">
            {research.brand}
          </h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {[
              formatDate(research.created_date),
              ...(research.platforms || []).map((platform) => PLATFORM_LABEL[platform] || platform),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        <div className="mt-5">
          <PublicResult research={research} posts={posts} />
        </div>
      </div>
    </div>
  );
}