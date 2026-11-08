import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Loader2, Radar } from "lucide-react";
import { chatWithDesk } from "@/lib/server-fns";

const GREETING =
  "Hi — I’m the Signal Desk assistant. Tell me your brand or what you’re trying to understand, and I’ll help you frame the questions worth asking.";

const SUGGESTIONS = [
  "What should I listen for before a launch?",
  "How does sentiment scoring work?",
  "Which platforms should I start with?",
];

export default function ClientChat() {
  const send = useServerFn(chatWithDesk);
  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy]);

  const post = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const { reply } = await send({ data: { messages: next.slice(-12) } });
      setMessages([...next, { role: "assistant", content: reply || "Tell me a little more." }]);
    } catch {
      setError("That didn’t go through. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      post(draft);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
          <Radar className="h-3.5 w-3.5" />
        </span>
        <p className="text-[12.5px] font-medium">The desk assistant</p>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">online</span>
      </div>

      <div className="max-h-[56vh] space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[86%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                message.role === "user"
                  ? "rounded-br-md bg-foreground text-background"
                  : "rounded-bl-md bg-secondary text-foreground"
              }`}
            >
              {message.content}
            </p>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <span className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-secondary px-3.5 py-3">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">reading</span>
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length === 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => post(suggestion)}
              className="rounded-full border border-border px-2.5 py-1.5 text-[11.5px] leading-tight text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && <p className="px-4 pb-2 text-[11.5px] text-[hsl(0_60%_42%)]">{error}</p>}

      <div className="flex items-end gap-2 border-t border-border p-2.5">
        <textarea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your question…"
          className="max-h-32 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
        />
        <button
          onClick={() => post(draft)}
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}