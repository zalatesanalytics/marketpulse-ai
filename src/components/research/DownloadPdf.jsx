import { FileDown } from "lucide-react";
import { downloadResearchPdf } from "@/lib/pdf";

export default function DownloadPdf({ research, posts }) {
  return (
    <button
      onClick={() => downloadResearchPdf(research, posts)}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground transition-colors hover:border-foreground/40"
    >
      <FileDown className="h-3.5 w-3.5" /> Download PDF
    </button>
  );
}