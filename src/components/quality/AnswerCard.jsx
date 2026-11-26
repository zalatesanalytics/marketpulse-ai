import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { PLATFORM_LABEL } from "@/lib/format";
import { CATEGORY_LABEL } from "@/components/quality/questions";

export default function AnswerCard({ entry }) {
  const points = entry.points || [];
  const evidence = entry.evidence || [];
  const meta = [
    entry.brand,
    entry.posts_read ? `${entry.posts_read} posts read` : "",
    (entry.platforms || []).join(" · "),
  ].filter(Boolean);

  return (
    <div className="w-full max-w-[94%] space-y-3 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="text-primary">Quality desk</span>
        {CATEGORY_LABEL[entry.category] && <span>· {CATEGORY_LABEL[entry.category]}</span>}
        {entry.cached && <span>· saved answer</span>}
      </div>

      <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{entry.answer}</p>

      {!!points.length && (
        <ul className="space-y-1.5 border-l border-border pl-3">
          {points.map((point, index) => (
            <li key={index} className="text-[12.5px] leading-relaxed text-muted-foreground">
              {point}
            </li>
          ))}
        </ul>
      )}

      {!!evidence.length && (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">In the posts</p>
          <ul className="mt-1.5 space-y-1">
            {evidence.map((item, index) => (
              <li key={index} className="flex items-baseline gap-1.5">
                <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  {PLATFORM_LABEL[item.platform] || item.platform}
                </span>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="line-clamp-2 text-[12px] leading-snug underline-offset-2 hover:text-primary hover:underline"
                  >
                    {item.title}
                  </a>
                ) : (
                  <span className="line-clamp-2 text-[12px] leading-snug">{item.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{meta.join(" · ")}</p>
        {entry.research_id && (
          <Link
            to="/report/$researchId"
            params={{ researchId: entry.research_id }}
            className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-primary underline-offset-2 hover:underline"
          >
            Full report <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}