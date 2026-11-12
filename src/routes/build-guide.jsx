import { createFileRoute } from "@tanstack/react-router";
import GuideShell from "@/components/guide/GuideShell";
import OverviewSection from "@/components/guide/OverviewSection";
import DataModelSection from "@/components/guide/DataModelSection";
import PipelineSection from "@/components/guide/PipelineSection";
import OutputsSection from "@/components/guide/OutputsSection";
import RunItSection from "@/components/guide/RunItSection";

export const Route = createFileRoute("/build-guide")({
  component: BuildGuide,
  head: () => ({
    meta: [
      { title: "How Signal Desk is built — practitioner's guide" },
      {
        name: "description",
        content:
          "The build guide: data model, scraping and ranking pipeline, sentiment scoring, output channels, and what you need to run a copy.",
      },
    ],
  }),
});

function BuildGuide() {
  return (
    <GuideShell>
      <header className="pb-1">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-primary">Build guide</p>
        <h1 className="mt-2 font-display text-[34px] leading-[1.08] tracking-[-0.015em] md:text-[42px]">
          How Signal Desk is built
        </h1>
        <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-muted-foreground">
          A working reference for the practitioner: what each layer does, why the pipeline is shaped this way, and the
          decisions worth copying into your own listening tool.
        </p>
      </header>

      <OverviewSection />
      <DataModelSection />
      <PipelineSection />
      <OutputsSection />
      <RunItSection />
    </GuideShell>
  );
}