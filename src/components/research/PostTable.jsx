import SentimentChip from "@/components/research/SentimentChip";
import TrendMark from "@/components/research/TrendMark";
import { compact, formatDate, PLATFORM_LABEL } from "@/lib/format";

const value = (n) => (n ? compact(n) : "—");

export default function PostTable({ posts = [] }) {
  if (!posts.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
        No scored posts for this run yet.
      </p>
    );
  }

  return (
    <>
      <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground md:hidden">
        Swipe for likes, shares, comments, views and trend →
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="py-2 pr-2 font-normal">#</th>
              <th className="py-2 pr-3 font-normal">Platform</th>
              <th className="py-2 pr-3 font-normal">Top post</th>
              <th className="py-2 px-2 text-right font-normal" title="Upvotes on Reddit, likes on X and YouTube">
                Likes
              </th>
              <th className="py-2 px-2 text-right font-normal" title="Reposts on X, crossposts on Reddit">
                Shares
              </th>
              <th className="py-2 px-2 text-right font-normal">Comments</th>
              <th className="py-2 px-2 text-right font-normal">Views</th>
              <th className="py-2 px-2 font-normal">Trend</th>
              <th className="py-2 pl-2 font-normal">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-border/60 last:border-0">
                <td className="py-3 pr-2 align-top font-mono text-[10.5px] text-muted-foreground/70">
                  {String(post.rank ?? 0).padStart(2, "0")}
                </td>
                <td className="whitespace-nowrap py-3 pr-3 align-top font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  {PLATFORM_LABEL[post.platform] || post.platform}
                </td>
                <td className="py-3 pr-3 align-top">
                  {post.url ? (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block text-[13px] leading-snug underline-offset-2 hover:underline"
                    >
                      {post.title}
                    </a>
                  ) : (
                    <p className="text-[13px] leading-snug">{post.title}</p>
                  )}
                  <p className="mt-1 truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    {[post.community || post.author, formatDate(post.published_at)].filter(Boolean).join(" · ")}
                  </p>
                  {post.sentiment_reason && post.sentiment_reason !== "Not scored" && (
                    <p className="mt-1 line-clamp-1 text-[11px] italic text-muted-foreground">
                      “{post.sentiment_reason}”
                    </p>
                  )}
                </td>
                <td className="py-3 px-2 text-right align-top font-mono text-[11px] tabular-nums">
                  {value(post.engagement)}
                </td>
                <td className="py-3 px-2 text-right align-top font-mono text-[11px] tabular-nums">
                  {value(post.shares)}
                </td>
                <td className="py-3 px-2 text-right align-top font-mono text-[11px] tabular-nums">
                  {value(post.comments)}
                </td>
                <td className="py-3 px-2 text-right align-top font-mono text-[11px] tabular-nums">
                  {value(post.views)}
                </td>
                <td className="py-3 px-2 align-top">
                  {post.trend ? (
                    <TrendMark trend={post.trend} />
                  ) : (
                    <span className="font-mono text-[10.5px] text-muted-foreground/70">—</span>
                  )}
                </td>
                <td className="py-3 pl-2 align-top">
                  <SentimentChip
                    sentiment={post.sentiment}
                    score={post.sentiment_score}
                    className="whitespace-nowrap"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
        Likes are upvotes on Reddit. Shares are reposts on X and crossposts on Reddit, where the platform reports
        them. Views are only reported by X and YouTube. Trend compares each post’s engagement per day with the rest
        of this run.
      </p>
    </>
  );
}