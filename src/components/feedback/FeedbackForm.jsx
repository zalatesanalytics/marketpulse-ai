import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { submitClientFeedback } from "@/lib/server-fns";

const TOPICS = [
  { value: "feedback", label: "How it felt" },
  { value: "bug", label: "Something broke" },
  { value: "question", label: "A question" },
];

const field =
  "w-full rounded-md border border-border bg-card px-3 py-2.5 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40";
const label = "block font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground";

export default function FeedbackForm() {
  const send = useServerFn(submitClientFeedback);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [topic, setTopic] = useState("feedback");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.message.trim()) {
      setError("A name and a note are all we need.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await send({ data: { ...form, topic } });
      setSent(true);
    } catch {
      setError("That note didn’t send. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center md:p-8">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(88_30%_90%)] text-[hsl(88_30%_26%)]">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-4 font-display text-[26px] leading-tight">Note received.</p>
        <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">
          It landed on the research desk. If you left an email, expect a reply there.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setForm({ name: "", email: "", company: "", message: "" });
          }}
          className="mt-5 rounded-md border border-border px-4 py-2 text-[12.5px] transition-colors hover:bg-secondary"
        >
          Leave another note
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 md:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="name">
            Your name
          </label>
          <input id="name" className={`${field} mt-1.5`} value={form.name} onChange={set("name")} placeholder="Amara Okoye" />
        </div>
        <div>
          <label className={label} htmlFor="email">
            Email <span className="normal-case tracking-normal">(so we can reply)</span>
          </label>
          <input
            id="email"
            type="email"
            className={`${field} mt-1.5`}
            value={form.email}
            onChange={set("email")}
            placeholder="you@company.com"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor="company">
          Company or brand
        </label>
        <input
          id="company"
          className={`${field} mt-1.5`}
          value={form.company}
          onChange={set("company")}
          placeholder="Optional"
        />
      </div>

      <div className="mt-4">
        <p className={label}>What is this about</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {TOPICS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTopic(option.value)}
              className={`rounded-md border px-2 py-2 text-[11.5px] leading-tight transition-colors ${
                topic === option.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor="message">
          Your note
        </label>
        <textarea
          id="message"
          rows={5}
          className={`${field} mt-1.5 resize-y leading-relaxed`}
          value={form.message}
          onChange={set("message")}
          placeholder="What worked, what confused you, what you would change…"
        />
      </div>

      {error && <p className="mt-3 text-[12px] leading-relaxed text-[hsl(0_60%_42%)]">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-[13px] text-background transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {busy ? "Sending…" : "Send the note"}
      </button>
    </form>
  );
}