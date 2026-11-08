import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Link2 } from "lucide-react";
import {
  deleteClientFeedback,
  listClientFeedback,
  setClientFeedbackStatus,
} from "@/lib/server-fns";
import NoteRow from "@/components/feedback/NoteRow";

export const Route = createFileRoute("/_authed/notes")({
  loader: async () => await listClientFeedback(),
  component: NotesPage,
  head: () => ({
    meta: [
      { title: "Client notes — Signal Desk" },
      { name: "description", content: "Notes clients leave on the shared feedback link, and the link to send them." },
    ],
  }),
});

function NotesPage() {
  const notes = Route.useLoaderData();
  const router = useRouter();
  const setStatus = useServerFn(setClientFeedbackStatus);
  const remove = useServerFn(deleteClientFeedback);

  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShareLink(`${window.location.origin}/client-feedback`);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const open = notes.filter((note) => note.status !== "done").length;

  const toggle = async (note) => {
    await setStatus({ data: { id: note.id, status: note.status === "done" ? "new" : "done" } });
    await router.invalidate();
  };

  const onDelete = async (note) => {
    await remove({ data: { id: note.id } });
    await router.invalidate();
  };

  return (
    <div className="mx-auto w-full max-w-[840px]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Client notes</p>
          <h1 className="mt-2 font-display text-[32px] leading-tight tracking-[-0.01em] md:text-[34px]">
            What your clients are saying
          </h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{open} open</p>
      </header>

      <section className="mt-5 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Share this link</h2>
        </div>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={shareLink}
            onFocus={(event) => event.target.select()}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[11.5px] text-foreground outline-none"
          />
          <button
            onClick={copy}
            disabled={!shareLink}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-[12.5px] text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          Anyone with this link lands in the chat with the desk assistant — no account or sign-in. Every question they ask
          shows up below.
        </p>
      </section>

      {notes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <p className="font-display text-[22px]">No notes yet.</p>
          <p className="mx-auto mt-2 max-w-[320px] text-[12.5px] leading-relaxed text-muted-foreground">
            Send the link above and the first notes will appear here.
          </p>
        </div>
      ) : (
        <section className="mt-4 rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border/60">
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} onToggle={toggle} onDelete={onDelete} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}