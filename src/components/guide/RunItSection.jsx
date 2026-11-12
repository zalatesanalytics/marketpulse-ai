import GuideSection from "@/components/guide/GuideSection";
import Snippet from "@/components/guide/Snippet";

const SETUP = [
  [
    "APIFY_TOKEN",
    "Read server-side only, from the runtime secrets, and passed to Apify as a bearer token. Without it the pipeline fails with a clear message instead of a broken run.",
  ],
  [
    "Google Docs + Sheets",
    "Authorised once as app connectors. Server code asks for the connection and uses the access token; the browser never sees it.",
  ],
  [
    "Surface split",
    "Public by design: the chat desk, a shared report by id, this guide. Everything else — new research, history, notes, a full report view — sits behind the sign-in gate.",
  ],
];

const GOTCHAS = [
  [
    "Same-name brands are the main failure mode",
    "Not scraping quality — meaning. The category in the query, the whole-word gate and the off-topic flag are three defences for the same problem; drop any one and a top-20 fills with the wrong subject.",
  ],
  [
    "Cost scales with platforms, not with the report",
    "Asking for more ranked posts is free; asking each platform for more items is not. Raise items per platform only after watching a few runs.",
  ],
  [
    "The slowest actor sets the wall clock",
    "A crawl that never finishes should degrade the report, not hang the page: return what landed, name the platform that was left out, and let the client read it.",
  ],
  [
    "Keep the model on a short leash",
    "Ask for a JSON schema, one row per numbered post, a bounded reason and a verbatim fragment. Then clamp the score to the label yourself — never print a positive label with a negative number.",
  ],
];

export default function RunItSection() {
  return (
    <GuideSection
      id="run-it"
      title="Run a copy"
      lead="Two things to configure, one rule about where they live. Then the repository has both hosts: this app, and a Streamlit build that runs the same pipeline."
    >
      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        {SETUP.map(([term, detail]) => (
          <div key={term} className="grid gap-1 px-4 py-3 md:grid-cols-[160px_minmax(0,1fr)] md:gap-4">
            <dt className="text-[12.5px] font-medium md:pt-0.5">{term}</dt>
            <dd className="text-[12.5px] leading-relaxed text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>

      <Snippet>{`// server only — never in a component
import { secrets } from "base44:runtime";
const token = secrets.get("APIFY_TOKEN");

// app-level OAuth, resolved inside the export handler
const { accessToken } = await base44.asServiceRole
  .connectors.getConnection("googledocs");`}</Snippet>

      <div>
        <h3 className="text-[14px] font-medium">The Python twin</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-mono text-[11.5px] text-primary">marketpulse/</span> holds the scraper and the analysis
          step as plain modules; <span className="font-mono text-[11.5px] text-primary">streamlit_app.py</span> is the
          interface, with its own setup notes and requirements. Same query, same normalization, same scoring prompt — so
          the two builds can be compared run for run. Set the Apify token there as an app secret, never in the file.
        </p>
      </div>

      <div>
        <h3 className="text-[14px] font-medium">What to carry into your own build</h3>
        <ul className="mt-2 space-y-2.5">
          {GOTCHAS.map(([title, detail]) => (
            <li key={title} className="border-l border-border pl-3.5">
              <p className="text-[12.5px] font-medium">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </GuideSection>
  );
}