import { Check, RotateCcw, Trash2 } from "lucide-react";

const TOPIC_LABEL = { feedback: "Feedback", bug: "Bug", question: "Question" };
const TOPIC_CLASS = {
  feedback: "border-[hsl(200_30%_82%)] bg-[hsl(200_40%_96%)] text-[hsl(200_35%_30%)]",
  bug: "border-[hsl(0_45%_86%)] bg-[hsl(0_60%_96%)] text-[hsl(0_55%_40%)]",
  question: "border-[hsl(42_55%_82%)] bg-[hsl(42_80%_95%)] text-[hsl(38_55%_32%)]",
};

const stamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  });
};

export default function NoteRow({ note, onToggle, onDelete }) {
  const done = note.status === "done";

  return (
    <li className={`px-5 py-4 transition-colors ${done ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13.5px] font-medium">{note.name}</p>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${
            TOPIC_CLASS[note.topic] || TOPIC_CLASS.feedback
          }`}
        >
          {TOPIC_LABEL[note.topic] || note.topic}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
          {stamp(note.created_date)}
        </span>
      </div>

      {(note.company || note.email) && (
        <p className="mt-1 font-mono text-[10px] tracking-[0.02em] text-muted-foreground">
          {[note.company, note.email].filter(Boolean).join(" · ")}
        </p>
      )}

      <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">{note.message}</p>

      <div className="mt-3 flex items-center gap-4">
        <button
          onClick={() => onToggle(note)}
          className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {done ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {done ? "Reopen" : "Mark done"}
        </button>
        <button
          onClick={() => onDelete(note)}
          className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-[hsl(0_55%_45%)]"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </li>
  );
}