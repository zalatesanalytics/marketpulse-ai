import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Radar } from "lucide-react";
import useQualityChat from "@/hooks/useQualityChat";
import QuestionLibrary from "@/components/quality/QuestionLibrary";
import AnswerCard from "@/components/quality/AnswerCard";

function Working({ stage }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] space-y-1.5 rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5">
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50"
              style={{ animationDelay: `${dot * 180}ms` }}
            />
          ))}
        </span>
        {stage && (
          <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            {stage}
          </p>
        )}
      </div>
    </div>
  );
}

export default function QualityChat() {
  const { messages, draft, setDraft, busy, stage, error, ask } = useQualityChat();
  const [category, setCategory] = useState("trend");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy, stage]);

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(draft);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,318px)_minmax(0,1fr)] lg:items-start">
      <QuestionLibrary
        active={category}
        onActive={setCategory}
        onAsk={(question) => ask(question, category)}
        disabled={busy}
      />

      <div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
              <Radar className="h-3.5 w-3.5" />
            </span>
            <p className="text-[12.5px] font-medium">Quality desk</p>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {busy ? "reading" : "online"}
            </span>
          </div>

          <div className="max-h-[54vh] min-h-[280px] space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) =>
              message.kind === "answer" ? (
                <div key={message.id} className="flex justify-start">
                  <AnswerCard entry={message.entry} />
                </div>
              ) : (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <p
                    className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      message.role === "user"
                        ? "rounded-br-md bg-foreground text-background"
                        : "rounded-bl-md bg-secondary text-foreground"
                    }`}
                  >
                    {message.content}
                  </p>
                </div>
              )
            )}

            {busy && <Working stage={stage} />}
            <div ref={endRef} />
          </div>

          {error && <p className="px-4 pb-2 text-[11.5px] text-[hsl(0_60%_42%)]">{error}</p>}

          <div className="flex items-end gap-2 border-t border-border p-2.5">
            <textarea
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask your own version of a test question…"
              className="max-h-32 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
            <button
              onClick={() => ask(draft)}
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Answers are written from the posts the scraper actually returned on Reddit, X and YouTube — a sample, not the
          whole internet. A question already answered comes back instantly, and a brand or category read in the last two
          weeks is answered from the sample already saved.
        </p>
      </div>
    </div>
  );
}