import { compact, PLATFORM_LABEL } from "@/lib/format";

const num = (n) => (n ? compact(n) : "—");
const CELL = "py-2.5 px-1 text-right align-top font-mono text-[10.5px] tabular-nums";

export default function ReactionsTable({ posts = [] }) {
  const top = [...posts]
    .map((post) => ({
      ...post,
      reactions:
        (post.engagement || 0) +
        (post.comments || 0) +
        (post.shares || 0) +
        (post.retweets || 0) +
        (post.reposts || 0),
    }))
    .sort((a, b) => b.reactions - a.reactions)
    .slice(0, 10);

  if (!top.length) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-medium">Top 10 reactions</h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          most reacted posts
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="py-2 pr-1 font-normal">#</th>
              <th className="py-2 pr-2 font-normal">Post</th>
              <th className="py-2 px-1 text-right font-normal">Likes</th>
              <th className="py-2 px-1 text-right font-normal">Views</th>
              <th className="py-2 px-1 text-right font-normal">Shares</th>
              <th className="py-2 pl-1 text-right font-normal">Reposts</th>
            </tr>
          </thead>
          <tbody>
            {top.map((post, i) => (
              <tr key={post.id || i} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-1 align-top font-mono text-[10px] text-muted-foreground/70">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="py-2.5 pr-2 align-top">
                  {post.url ? (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="line-clamp-2 text-[12.5px] leading-snug underline-offset-2 hover:text-primary hover:underline"
                    >
                      {post.title}
                    </a>
                  ) : (
                    <p className="line-clamp-2 text-[12.5px] leading-snug">{post.title}</p>
                  )}
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    {PLATFORM_LABEL[post.platform] || post.platform}
                  </p>
                </td>
                <td className={CELL}>{num(post.engagement)}</td>
                <td className={CELL}>{num(post.views)}</td>
                <td className={CELL}>{num(post.shares)}</td>
                <td className={`${CELL} pl-1`}>{num((post.retweets || 0) + (post.reposts || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
        Ranked by total reactions. Likes are upvotes on Reddit. Shares and views are only shown where the platform
        reports them. Reposts combine X retweets and quote posts.
      </p>
    </section>
  );
}