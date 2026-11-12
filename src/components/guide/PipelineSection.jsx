import GuideSection from "@/components/guide/GuideSection";
import Step from "@/components/guide/Step";
import Snippet from "@/components/guide/Snippet";

const NUMBERS = [
  ["15", "posts asked of each platform (public run)"],
  ["30", "candidates scored, headroom above the report"],
  ["20", "posts reported, per-platform floor of 5"],
  ["90", "day window; older posts are filtered out"],
  ["75s", "grace before the read goes ahead without a slow platform"],
];

export default function PipelineSection() {
  return (
    <GuideSection
      id="pipeline"
      title="The pipeline, step by step"
      lead="Every run is the same eight steps. Each one narrows the set — and each one leaves a warning behind when it has to drop something, so a thin report explains itself."
    >
      <ol className="mt-1">
        <Step n="1" title="Intake, from a chat or a form">
          <p>
            On the public desk the visitor just talks. One LLM call extracts a brief as typed JSON: brand, category, a
            short disambiguating search phrase, up to three competitors and the decision the research supports. The
            signed-in wizard asks for the same five fields directly.
          </p>
          <p>If no brand comes back, the run stops at intake instead of guessing one.</p>
        </Step>

        <Step n="2" title="Pin the name before searching">
          <p>
            A bare brand name is a search hazard — "Jordan" pulls the athlete, "Dove" pulls the bird. The query always
            carries the category, and competitors ride along as alternatives.
          </p>
          <Snippet>{`// "Jordan" + "sneaker brand" -> "jordan brand sneakers OR Nike OR Adidas"
const focus = pinned || [brand, categoryWords(category)].join(" ");
return [focus, ...competitors].join(" OR ");`}</Snippet>
        </Step>

        <Step n="3" title="Start the scrapers, never wait on them">
          <p>
            Each platform is an Apify actor behind its own input shape: Reddit takes a search query with a sort and a
            time filter, YouTube a query with a date filter and no transcription, X search terms capped at a fixed count.
          </p>
          <p>
            The run is started asynchronously — <code className="font-mono text-[11.5px]">POST /acts/&lt;actor&gt;/runs</code> —
            and the returned run ids are stored on the Research record. A page polls a second function, which reads each
            run and asks Apify for its dataset once it has succeeded. No request ever holds an eight-minute crawl.
          </p>
        </Step>

        <Step n="4" title="Normalize into one post shape">
          <p>
            Providers disagree about everything. Counts arrive under different keys per platform, dates as epoch seconds,
            timestamps or strings, bodies as HTML with tracking links. One normalizer maps each platform's fields into a
            single record and returns <code className="font-mono text-[11.5px]">null</code> for anything without text.
          </p>
          <Snippet>{`reddit   likes: ["upVotes", "upvoteCount", "score"]
x        likes: ["likeCount", "likes"], retweets: ["retweetCount"], reposts: ["quoteCount"]
youtube  likes: ["likes", "likeCount"], views: ["viewCount"]`}</Snippet>
          <p>X reports retweets and reposts separately, so that platform's share count is their sum.</p>
        </Step>

        <Step n="5" title="Gate on the brand, whole word only">
          <p>
            Before ranking, anything that never names the brand is dropped. The keywords are the brand as written, a form
            without a leading "the", and a form without a trailing generic word — "Jordan Brand" also matches "Jordan".
            Matching is whole-phrase, so "Nike" cannot fire on "Nikea" and "Dove" cannot fire on "Dover".
          </p>
          <p>The count of dropped posts is kept as a warning, not hidden.</p>
        </Step>

        <Step n="6" title="Rank, keep every platform represented">
          <p>Engagement decides order, weighted so conversation outranks a passive view:</p>
          <Snippet>{`rankScore = likes + 2 × comments + 0.01 × views`}</Snippet>
          <p>
            The pool is filled platform by platform — the top five of each — then by score, up to thirty candidates. That
            floor stops one loud platform from filling the whole table, and the same rule is applied again when the final
            twenty are chosen.
          </p>
        </Step>

        <Step n="7" title="Score sentiment in one pass, with evidence">
          <p>
            The candidates are numbered and sent once with a JSON schema: sentiment, a score from −1 to 1, a reason under
            twelve words, a verbatim fragment as evidence, and an off-topic flag. A second call covers any row the model
            skipped, so a weak row never becomes an unscored post.
          </p>
          <p>
            Two guards keep the labels honest. Scores are clamped so the label and the number always agree — positive
            never below 0.2, negative never above −0.2, neutral inside ±0.1 — and every post the scorer marks off-topic is
            removed rather than counted as neutral coverage. That is the real defence when a brand name is also a game.
          </p>
        </Step>

        <Step n="8" title="Trend against the room, then persist">
          <p>
            Trend is not raw engagement: it is engagement plus comments per day since publication, compared with the
            median of the posts actually reported. A week-old post is not punished against a year-old one.
          </p>
          <p>
            Counts, average score, top ten topics, summary and recommendation are written onto the Research row; each post
            is written with its rank and evidence. The interface then reads one record and one ordered list.
          </p>
        </Step>
      </ol>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Run numbers</p>
        <dl className="mt-2.5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {NUMBERS.map(([value, label]) => (
            <div key={label} className="flex items-baseline gap-2.5">
              <dt className="font-mono text-[15px] tabular-nums">{value}</dt>
              <dd className="text-[12px] leading-snug text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </GuideSection>
  );
}