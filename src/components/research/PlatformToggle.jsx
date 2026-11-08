import { cn } from "@/lib/utils";

export const PLATFORMS = [
  { id: "reddit", label: "Reddit", note: "Threads + comments" },
  { id: "x", label: "X", note: "Posts + replies" },
  { id: "youtube", label: "YouTube", note: "Videos + comments" },
];

export default function PlatformToggle({ value = [], onChange }) {
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {PLATFORMS.map((p) => {
        const active = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-all",
              active
                ? "border-foreground/70 bg-card shadow-[0_1px_2px_rgba(20,18,12,0.08)]"
                : "border-border bg-transparent hover:border-foreground/25 hover:bg-card/60"
            )}
          >
            <span className="flex items-center justify-between">
              <span className="text-[13px] font-medium">{p.label}</span>
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border",
                  active ? "border-foreground bg-foreground" : "border-input"
                )}
              >
                {active && <span className="h-1.5 w-1.5 rounded-[1px] bg-background" />}
              </span>
            </span>
            <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              {p.note}
            </span>
          </button>
        );
      })}
    </div>
  );
}