export default function Step({ n, title, children }) {
  return (
    <li className="relative border-l border-border pb-6 pl-7 last:pb-0">
      <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card font-mono text-[10px] text-muted-foreground">
        {n}
      </span>
      <h3 className="text-[14px] font-medium leading-snug">{title}</h3>
      <div className="mt-1.5 space-y-2 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </li>
  );
}