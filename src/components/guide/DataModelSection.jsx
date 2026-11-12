import GuideSection from "@/components/guide/GuideSection";

const ENTITIES = [
  {
    name: "Research",
    purpose: "One run: what was asked, what came back, what to do next.",
    fields: [
      ["brand, category, goal", "the brief — what the client asked for"],
      ["competitors", "comma separated names"],
      ["platforms, status", "which sources were read; running, complete or failed"],
      ["scraper_runs", "the in-flight Apify run ids, cleared once the posts are saved"],
      ["summary, themes, trending_topics", "the read-out: prose, themes, and a ranked top 10 with mention counts"],
      ["recommendation", "the suggested next move"],
      ["positive/neutral/negative_count, avg_sentiment", "the aggregate, precomputed so lists never recompute it"],
      ["total_scraped, estimated_cost_usd, warnings, error", "provenance and honesty about what was skipped"],
    ],
  },
  {
    name: "Post",
    purpose: "One ranked post, denormalized so a report reads from a single query.",
    fields: [
      ["research_id, rank, platform", "which run, which position, which source"],
      ["title, excerpt, author, community, url, published_at", "the post as people see it"],
      ["engagement, comments, views, shares, retweets, reposts", "per-platform metrics, zero when a platform does not report one"],
      ["trend", "rising, steady or cooling — engagement velocity against the rest of the run"],
      ["sentiment, sentiment_score, sentiment_reason, sentiment_evidence", "label, −1 to 1 score, why, and a verbatim quote"],
    ],
  },
  {
    name: "ClientFeedback",
    purpose: "Every visitor question and note the desk has to answer.",
    fields: [
      ["name, email, company, topic", "who wrote in; topic is feedback, bug or question"],
      ["message, status", "the note itself, and new or done"],
    ],
  },
];

export default function DataModelSection() {
  return (
    <GuideSection
      id="data-model"
      title="Three entities, no joins"
      lead="A report is one Research row plus up to twenty Post rows, each carrying its own numbers and its own verdict. Nothing is computed on read, so a shared link or an export never has to fan out."
    >
      <div className="space-y-3">
        {ENTITIES.map((entity) => (
          <div key={entity.name} className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
              <p className="font-mono text-[11px] tracking-[0.04em] text-foreground">{entity.name}</p>
              <p className="text-[11.5px] text-muted-foreground">{entity.purpose}</p>
            </div>
            <dl className="divide-y divide-border/60">
              {entity.fields.map(([field, note]) => (
                <div key={field} className="grid gap-1 px-4 py-2 md:grid-cols-[210px_minmax(0,1fr)] md:gap-3">
                  <dt className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">{field}</dt>
                  <dd className="text-[12.5px] leading-relaxed">{note}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Access rules sit on the schemas rather than in the pages. Research and Post rows are readable and writable by their
        creator or an admin; the shared report is served by a deliberate service-role read that returns a run only when its
        status is complete and only by its id. Client notes are created openly by visitors and readable only by their author
        or an admin, because the shared link is how a stranger reaches the desk.
      </p>
    </GuideSection>
  );
}