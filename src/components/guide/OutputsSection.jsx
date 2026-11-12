import GuideSection from "@/components/guide/GuideSection";

const CHANNELS = [
  {
    name: "In the chat",
    detail:
      "The ranked table, the sentiment split, the topics and the recommended move render under the conversation, with post titles linking to their source.",
  },
  {
    name: "Shareable report",
    detail:
      "A report route serves a finished run by id through a service-role read, so a client opens it without an account. Only completed runs are readable, and nothing is listable.",
  },
  {
    name: "Google Docs",
    detail:
      "The report is composed as HTML — headings, tables, and a sentiment bar drawn from coloured table cells — and uploaded as a multipart conversion, so Drive returns a real Doc rather than a stored file.",
  },
  {
    name: "Google Sheets",
    detail:
      "A spreadsheet is created with two tabs, Ranking and Trend report, then filled in one values batchUpdate.",
  },
  {
    name: "Excel",
    detail:
      "Generated in the browser by a small writer that builds the workbook XML and packs it as a zip — no spreadsheet library shipped to the client.",
  },
  {
    name: "PDF",
    detail:
      "Drawn page by page with a PDF library: wrapped headlines, the sentiment split as a bar, the topics table, and every post title carrying a live link.",
  },
];

export default function OutputsSection() {
  return (
    <GuideSection
      id="outputs"
      title="One run, seven ways out"
      lead="The report is stored before it is displayed, so every output channel reads the same rows. Nothing is regenerated per channel, and nothing can disagree."
    >
      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        {CHANNELS.map((channel) => (
          <div key={channel.name} className="grid gap-1 px-4 py-3 md:grid-cols-[130px_minmax(0,1fr)] md:gap-4">
            <dt className="text-[12.5px] font-medium md:pt-0.5">{channel.name}</dt>
            <dd className="text-[12.5px] leading-relaxed text-muted-foreground">{channel.detail}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        The seventh is the desk itself: every visitor question and run is saved as a client note, so the shared link is
        also an inbox. Notes are triaged in the workspace, which is intended for the operator — make staff who need that
        view admins, since admins can see and change all data.
      </p>
    </GuideSection>
  );
}