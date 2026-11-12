export default function GuideSection({ id, title, lead, children }) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-border pt-8">
      <h2 className="font-display text-[26px] leading-tight tracking-[-0.01em]">{title}</h2>
      {lead && <p className="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed text-muted-foreground">{lead}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}