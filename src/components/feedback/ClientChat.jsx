import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Loader2, Radar, RotateCw } from "lucide-react";
import { chatWithDesk } from "@/lib/server-fns";
import { readPublicCheck, startPublicCheck } from "@/lib/public-run";
import PublicResult from "@/components/feedback/PublicResult";
import SignInInvite from "@/components/feedback/SignInInvite";
import { useAuth } from "@/lib/AuthContext";

const GREETING =
  "Hi — I’m the Signal Desk assistant. Give me a product or brand name and I’ll bring back the top 20 posts from the past 90 days on Reddit, X and YouTube, ranked with comments, views, reactions, dates and sentiment.";

const SUGGESTIONS = ["Nike", "How does sentiment scoring work?", "Which platforms should I start with?"];

// One guest scan per visit: another brand needs an account, so the report is kept.
const ASK_TO_SIGN_IN =
  "That first report was on the house. Sign in — or create a free account — below and ask again: the next brand scans straight away, and your studies stay in your history.";

export default function ClientChat() {
  const send = useServerFn(chatWithDesk);
  const startCheck = useServerFn(startPublicCheck);
  const readCheck = useServerFn(readPublicCheck);

  const [messages, setMessages] = useState([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const endRef = useRef(null);
  const { isAuthenticated, isLoadingAuth } = useAuth();

  // A signed-out visitor gets one read; anything after it asks them to sign in first.
  const needsAccount = !!result && !isLoadingAuth && !isAuthenticated;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy, result]);

  // The crawl runs on the scrapers' side, so the page starts it, then polls until
  // every platform has returned before showing the ranked read.
  const run = async (history) => {
    setRunning(true);
    setError("");
    try {
      const started = await startCheck({ data: { messages: history.slice(-12) } });
      if (!started.ok) {
        if (!started.needBrand) setError(started.error || "The read didn’t come back. Try again.");
        return;
      }

      const began = Date.now();
      const deadline = began + 180000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const step = await readCheck({
          data: { brief: started.brief, runs: started.runs, elapsedMs: Date.now() - began },
        });
        if (step.stage === "scraping") continue;
        if (step.ok) setResult(step);
        else setError(step.error || "The read didn’t come back. Try again.");
        return;
      }
      setError("The read is taking longer than usual. Try again in a moment.");
    } catch {
      setError("The read didn’t come back. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  };

  const askToSignIn = () => {
    setError("");
    setMessages((prev) => [...prev, { role: "assistant", content: ASK_TO_SIGN_IN }]);
  };

  const post = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setError("");

    if (needsAccount) {
      setMessages([...next, { role: "assistant", content: ASK_TO_SIGN_IN }]);
      return;
    }

    setBusy(true);

    const read = !result && !running ? run(next) : null;

    try {
      const { reply } = await send({ data: { messages: next.slice(-12) } });
      setMessages([...next, { role: "assistant", content: reply || "Tell me a little more." }]);
    } catch {
      setError("That didn’t go through. Try again in a moment.");
    } finally {
      setBusy(false);
    }

    if (read) await read;
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      post(draft);
    }
  };

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

        <div className="max-h-[46vh] space-y-3 overflow-y-auto px-4 py-4">
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
            placeholder="Type a product or brand name…"
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

      {running && (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Reading the past 90 days on Reddit, X and YouTube, then ranking the top 20. The crawlers do the slow part, so this usually lands in under a minute.
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center justify-end">
            <button
              onClick={() => (needsAccount ? askToSignIn() : run(messages))}
              disabled={running}
              className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
              Run again
            </button>
          </div>
          <PublicResult research={result.research} posts={result.posts} />
          <SignInInvite />
        </div>
      )}
    </div>
  );
}