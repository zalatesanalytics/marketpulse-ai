import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import IntakeWizard from "@/components/research/IntakeWizard";
import SampleRunPreview from "@/components/research/SampleRunPreview";
import { createResearch } from "@/lib/server-fns";

export const Route = createFileRoute("/_authed/")({
  component: NewResearchPage,
  head: () => ({
    meta: [
      { title: "New research — Signal Desk" },
      { name: "description", content: "Answer five quick questions and pull the loudest brand conversations across Reddit, X and YouTube." },
    ],
  }),
});

function NewResearchPage() {
  const navigate = useNavigate();
  const start = useServerFn(createResearch);
  const [busy, setBusy] = useState(false);

  const handleRun = async (brief) => {
    setBusy(true);
    try {
      const record = await start({
        data: {
          brand: brief.brand,
          category: brief.category || "",
          competitors: brief.competitors || "",
          goal: brief.goal || "",
          platforms: brief.platforms,
        },
      });
      navigate({ to: "/research/$researchId", params: { researchId: record.id } });
    } catch (error) {
      toast.error("Could not start that research. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <header className="border-b border-border pb-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Research desk</p>
        <h1 className="mt-3 max-w-[640px] font-display text-[38px] leading-[1.05] tracking-[-0.01em] md:text-[46px]">
          Know what the line is saying.
        </h1>
        <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-muted-foreground">
          Tell me which brand to watch. I’ll scrape the public conversations, rank the twenty loudest posts, and score
          every one for sentiment — so your next decision is grounded in evidence.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <IntakeWizard onRun={handleRun} busy={busy} />

        <div className="space-y-6">
          <SampleRunPreview />

          <section className="rounded-xl border border-border bg-[hsl(40_28%_95%)] p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Before you run</h2>
            <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                Scraping runs on your Apify account, so each search is billed at Apify’s per-result rate — a few cents
                for a thirty-post pull per platform.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                Sentiment scoring runs once per search over the top twenty posts, not per scraped item.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                Every completed run is stored, so you can revisit the evidence months later.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}