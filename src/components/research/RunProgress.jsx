import { Loader2 } from "lucide-react";
import { PLATFORM_LABEL } from "@/lib/format";

export default function RunProgress({ platforms = [] }) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-[hsl(88_32%_38%)]" />
      <h2 className="mt-5 font-display text-[26px] leading-tight">Reading the room…</h2>
      <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-muted-foreground">
        Scraping {platforms.map((p) => PLATFORM_LABEL[p] || p).join(", ")}, ranking the loudest posts, then scoring
        each one for sentiment. A run usually takes thirty to ninety seconds.
      </p>
      <div className="mx-auto mt-6 flex max-w-[320px] flex-col gap-1.5 text-left">
        {[
          `Collect public posts from ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`,
          "Rank by engagement and keep the top 20",
          "Score sentiment and write the read-out",
        ].map((line, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <span className="h-1 w-1 rounded-full bg-foreground/30" />
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}