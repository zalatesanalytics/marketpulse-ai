import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileSpreadsheet, Loader2 } from "lucide-react";
import { exportResearchToSheets } from "@/lib/server-fns";

export default function ExportToSheets({ researchId }) {
  const exportRun = useServerFn(exportResearchToSheets);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await exportRun({ data: { research_id: researchId } });
      if (result.ok) setUrl(result.url);
      else setError(result.error);
    } catch {
      setError("The export failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground transition-colors hover:border-foreground/40"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Open in Google Sheets
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground transition-colors hover:border-foreground/40 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
        {busy ? "Exporting…" : "Export to Sheets"}
      </button>
      {error && <p className="max-w-[300px] font-mono text-[9.5px] leading-relaxed text-[hsl(0_60%_42%)]">{error}</p>}
    </div>
  );
}