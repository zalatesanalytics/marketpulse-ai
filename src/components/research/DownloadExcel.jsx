import { Download } from "lucide-react";
import { downloadWorkbook, researchWorkbook } from "@/lib/xlsx";

export default function DownloadExcel({ research, posts }) {
  const handleDownload = () => {
    const { filename, sheets } = researchWorkbook(research.id, research, posts);
    downloadWorkbook(filename, sheets);
  };

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground transition-colors hover:border-foreground/40"
    >
      <Download className="h-3.5 w-3.5" /> Download Excel
    </button>
  );
}