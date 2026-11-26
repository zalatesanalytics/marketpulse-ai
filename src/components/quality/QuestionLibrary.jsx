import { CATEGORIES } from "@/components/quality/questions";

export default function QuestionLibrary({ active, onActive, onAsk, disabled }) {
  const current = CATEGORIES.find((category) => category.id === active) || CATEGORIES[0];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-3.5 py-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Question library · 40</p>
        <p className="mt-1 text-[12.5px] leading-relaxed">
          Ten ready-to-run questions in each type. Pick one and the desk reads the live conversation before answering.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => onActive(category.id)}
            className={`rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors ${
              current.id === category.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {category.short}
          </button>
        ))}
      </div>

      <p className="border-b border-border/60 px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {current.measure}
      </p>

      <ul className="max-h-[34vh] space-y-0.5 overflow-y-auto p-2 lg:max-h-[52vh]">
        {current.questions.map((question, index) => (
          <li key={question}>
            <button
              onClick={() => onAsk(question)}
              disabled={disabled}
              className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="mt-[3px] shrink-0 font-mono text-[9px] text-muted-foreground/70">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[12px] leading-snug">{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}