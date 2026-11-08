import { useState, useRef, useEffect } from "react";
import { ArrowRight, Check, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PlatformToggle from "@/components/research/PlatformToggle";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "brand", prompt: "Let’s start simple — which brand or product should I follow?", placeholder: "e.g. Aria Coffee Roasters" },
  { key: "category", prompt: "What category does it compete in?", placeholder: "e.g. specialty coffee subscriptions in Kenya" },
  { key: "competitors", prompt: "Which competitors should I benchmark against?", placeholder: "e.g. Java House, Blue Bottle, Trade", hint: "Separate names with commas — or skip" },
  { key: "platforms", prompt: "Where should I listen?", kind: "platforms" },
  { key: "goal", prompt: "Last one — what decision is this research meant to support?", placeholder: "e.g. Should our next campaign lead with price or with sourcing?", kind: "textarea" },
];

export default function IntakeWizard({ onRun, busy }) {
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState({ brand: "", category: "", competitors: "", platforms: ["reddit", "youtube"], goal: "" });
  const [draft, setDraft] = useState("");
  const [answers, setAnswers] = useState([]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step, answers.length]);

  const current = STEPS[step];
  const done = step >= STEPS.length;

  const commit = (value) => {
    const cleaned = typeof value === "string" ? value.trim() : value;
    if (!cleaned || (Array.isArray(cleaned) && cleaned.length === 0)) return;
    setBrief((b) => ({ ...b, [current.key]: cleaned }));
    setAnswers((a) => [...a, { key: current.key, label: current.prompt, value: Array.isArray(cleaned) ? cleaned.join(" · ") : cleaned }]);
    setDraft("");
    setStep((s) => s + 1);
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(20,18,12,0.04)]">
      <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(88_32%_40%)]" />
          <h2 className="text-[13px] font-medium tracking-tight">Research intake</h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {Math.min(step, STEPS.length)} / {STEPS.length}
        </span>
      </header>

      <div className="max-h-[420px] space-y-4 overflow-y-auto px-5 py-5">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-mono text-[9px]">
            SD
          </span>
          <div className="rounded-lg rounded-tl-none bg-secondary/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed">
            I’m your research desk. Answer five quick questions, and I’ll pull the loudest conversations across your chosen platforms, then rank them by sentiment.
          </div>
        </div>

        {answers.map((a, i) => (
          <div key={a.key} className="space-y-3">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-mono text-[9px]">
                SD
              </span>
              <div className="rounded-lg rounded-tl-none bg-secondary/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {STEPS[i].prompt}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="flex max-w-[85%] items-start gap-2 rounded-lg rounded-tr-none border border-border bg-background px-3.5 py-2 text-[13px]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(88_32%_38%)]" />
                <span>{a.value}</span>
              </div>
            </div>
          </div>
        ))}

        {!done && (
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-mono text-[9px]">
              SD
            </span>
            <div className="w-full max-w-[92%] rounded-lg rounded-tl-none bg-secondary/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {current.prompt}
              {current.hint && <span className="mt-1 block text-[11.5px] text-muted-foreground">{current.hint}</span>}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border px-5 py-4">
        {!done && current.kind === "platforms" && (
          <div className="space-y-3">
            <PlatformToggle
              value={Array.isArray(brief.platforms) ? brief.platforms : []}
              onChange={(v) => setBrief((b) => ({ ...b, platforms: v }))}
            />
            <Button size="sm" className="w-full sm:w-auto" disabled={!brief.platforms?.length} onClick={() => commit(brief.platforms)}>
              Continue <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {!done && current.kind !== "platforms" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commit(draft);
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            {current.kind === "textarea" ? (
              <Textarea
                autoFocus
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={current.placeholder}
                className="min-h-[44px] resize-none bg-background text-[13.5px]"
              />
            ) : (
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={current.placeholder}
                className="bg-background text-[13.5px]"
              />
            )}
            <Button type="submit" size="sm" className="shrink-0" disabled={!draft.trim()}>
              Send <CornerDownLeft className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </form>
        )}

        {done && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span>{brief.brand}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{brief.platforms?.join(" + ")}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>top 20 ranked</span>
            </div>
            <Button className={cn("w-full")} disabled={busy} onClick={() => onRun(brief)}>
              {busy ? "Starting research…" : "Run research"}
              {!busy && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}