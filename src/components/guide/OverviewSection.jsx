import GuideSection from "@/components/guide/GuideSection";

const STACK = [
  [
    "App shell",
    "TanStack Start (React 19) with file-based routes, server-rendered by default. Hosted on Base44; server code runs on Cloudflare Workers.",
  ],
  [
    "Interface",
    "Tailwind CSS over a small token set, shadcn/ui primitives and lucide icons. One cream-and-ink palette, one serif for headlines.",
  ],
  [
    "Data",
    "Base44 entities — Research, Post and ClientFeedback — reached only through server functions that check who is calling.",
  ],
  [
    "Social data",
    "Apify actors called over REST from server code. The API token is a secret read on the server and never reaches the browser.",
  ],
  [
    "Reasoning",
    "One LLM core call with a JSON response schema, so brand extraction and sentiment scoring return typed rows instead of prose.",
  ],
  [
    "Files out",
    "Google Docs and Sheets through OAuth connectors; the Excel workbook and the PDF are generated in the browser.",
  ],
];

const MAP = [
  ["src/routes/", "Pages: the public chat at /, this guide, the shareable report, and the signed-in workspace under /_authed."],
  ["src/lib/server-fns.js", "The whole API surface: create a run, start scrapes, finish a run, export, read a shared report."],
  ["src/lib/analysis.server.js", "The pipeline itself — gate, rank, score, aggregate."],
  ["src/lib/apify.server.js", "The provider: actor ids, per-platform inputs, field maps, normalization."],
  ["src/lib/brand-filter.js", "The name-collision gate that decides what is even about the brand."],
  ["base44/entities/", "Entity schemas, including each record's access rules."],
];

export default function OverviewSection() {
  return (
    <GuideSection
      id="overview"
      title="What this is and what it is built on"
      lead="Signal Desk turns a brand question into a ranked, scored read of public conversation on Reddit, X and YouTube. This page is the build guide: the shape of the data, every step of the pipeline, how the result ships, and what you need to run a copy."
    >
      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        {STACK.map(([term, description]) => (
          <div key={term} className="grid gap-1 px-4 py-3 md:grid-cols-[130px_minmax(0,1fr)] md:gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground md:pt-1">{term}</dt>
            <dd className="text-[13px] leading-relaxed">{description}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="text-[14px] font-medium">Where things live</h3>
        <dl className="mt-2 space-y-2">
          {MAP.map(([path, description]) => (
            <div key={path} className="flex flex-col gap-0.5 md:flex-row md:gap-3">
              <dt className="shrink-0 font-mono text-[11px] text-primary md:w-[210px]">{path}</dt>
              <dd className="text-[12.5px] leading-relaxed text-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="rounded-lg border border-border bg-secondary px-3.5 py-3 text-[12.5px] leading-relaxed">
        The same pipeline exists twice: this TanStack Start app, and a standalone Python package plus Streamlit app in the
        repository for hosting off-platform. The logic is mirrored step for step, so a change to one belongs in the other.
      </p>
    </GuideSection>
  );
}