import SentimentChip from "@/components/research/SentimentChip";
import { compact, PLATFORM_LABEL } from "@/lib/format";

export default function PostTable({ posts = [] }) {
  if (!posts.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
        No scored posts for this run yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {posts.map((post) => (
        <li key={post.id} className="group grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 py-3.5 first:pt-0 last:pb-0">
          <span className="pt-0.5 font-mono text-[11px] text-muted-foreground/70">
            {String(post.rank).padStart(2, "0")}
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{PLATFORM_LABEL[post.platform] || post.platform}</span>
              {post.community && (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span className="truncate normal-case tracking-normal">{post.community}</span>
                </>
              )}
            </div>

            {post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 block text-[13.5px] leading-snug underline-offset-2 hover:underline"
              >
                {post.title}
              </a>
            ) : (
              <p className="mt-1 text-[13.5px] leading-snug">{post.title}</p>
            )}

            {post.excerpt && (
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{post.excerpt}</p>
            )}

            {post.sentiment_reason && post.sentiment_reason !== "Not scored" && (
              <p className="mt-1.5 text-[11.5px] italic text-muted-foreground">“{post.sentiment_reason}”</p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
              <span>{compact(post.engagement)} likes</span>
              <span>{compact(post.comments)} comments</span>
              {!!post.views && <span>{compact(post.views)} views</span>}
              {post.author && <span className="truncate">@{post.author}</span>}
            </div>
          </div>

          <SentimentChip sentiment={post.sentiment} score={post.sentiment_score} className="self-start" />
        </li>
      ))}
    </ul>
  );
}