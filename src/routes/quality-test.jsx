import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Radar } from "lucide-react";
import QualityChat from "@/components/quality/QualityChat";

export const Route = createFileRoute("/quality-test")({
  component: QualityTest,
  head: () => ({
    meta: [
      { title: "Data quality test — Signal Desk" },
      {
        name: "description",
        content:
          "Forty ready-to-run questions across trend detection, sentiment tracking, community discovery and competitive mapping — each answered from a live scrape.",
      },
    ],
  }),
});

function QualityTest() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-4 md:px-10">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
              <Radar className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-medium tracking-tight">Signal Desk</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to the desk
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1200px] px-5 py-9 md:px-10 md:py-12">
        <div className="max-w-[70ch]">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-primary">Quality desk</p>
          <h1 className="mt-2 font-display text-[32px] leading-[1.08] tracking-[-0.015em] md:text-[40px]">
            Social Media Scraper — Data Quality Test
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            Forty ready-to-run questions, ten per question type. Ask one and the desk scrapes the public conversation
            behind it, then answers from what actually came back — including the parts the sample cannot answer.
          </p>
        </div>

        <div className="mt-7">
          <QualityChat />
        </div>
      </div>
    </div>
  );
}