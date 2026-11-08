import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, FileSpreadsheet, LayoutDashboard, Loader2, Radar, RotateCw, Table2 } from "lucide-react";
import { chatWithDesk } from "@/lib/server-fns";
import { runPublicCheck } from "@/lib/public-run";
import PublicResult from "@/components/feedback/PublicResult";

const GREETING =
  "Hi — I’m the Signal Desk assistant. Tell me your brand or what you’re trying to understand, and when you’re ready tell me how you want the results: a dashboard view, an analysis table with a recommendation, or an Excel file.";

const SUGGESTIONS = [
  "What should I listen for before a launch?",
  "How does sentiment scoring work?",
  "Which platforms should I start with?",
];

const FORMATS = [
  { value: "dashboard", label: "Dashboard", hint: "Summary, sentiment, topics", icon: LayoutDashboard },
  { value: "table", label: "Analysis table", hint: "Ranked posts + recommendation", icon: Table2 },
  { value: "excel", label: "Excel file", hint: "Download and send it on", icon: FileSpreadsheet },
];

export default function ClientChat() {
  const send = useServerFn(chatWithDesk);
  const runCheck = useServerFn(runPublicCheck);

  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [format, setFormat] = useState("dashboard");
  const [running, setRunning] = useState(false);
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

  const run = async (value) => {
    setRunning(true);
    setError("");
    try {
      const data = await runCheck({ data: { messages: messages.slice(-12), format: value } });
      if (!data.ok) {
        setError(data.error || "The read didn’t come back. Try again.");
        return;
      }
      setResult(data);
    } catch {
      setError("The read didn’t come back. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  };

  const pick = (value) => {
    setFormat(value);
    if (!result && !running) run(value);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      post(draft);
    }
  };

  const asked = messages.some((message) => message.role === "user");

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
            <Radar className="h-3.5 w-3.5" />
          </span>
          <p className="text-[12.5px] font-medium">The desk assistant</p>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">online</span>
        </div>

        <div className="max-h-[52vh] space-y-3 overflow-y-auto px-4 py-4">
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

      {!result && asked && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              {running ? "Reading the conversation" : "Confirm and I’ll pull the results"}
            </p>
            {running && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {running
              ? "Scraping Reddit, X and YouTube, then scoring every post. This takes about a minute."
              : "How do you want them? I read the public conversation and rank the loudest posts."}
          </p>
          <div className="mt-3 grid gap-1.5">
            {FORMATS.map((option) => (
              <button
                key={option.value}
                onClick={() => pick(option.value)}
                disabled={running}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                  format === option.value
                    ? "border-foreground bg-secondary"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <option.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FORMATS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFormat(option.value)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors ${
                  format === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => run(format)}
              disabled={running}
              className="ml-auto inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
              Run again
            </button>
          </div>
          <PublicResult research={result.research} posts={result.posts} format={format} />
        </div>
      )}
    </div>
  );
}