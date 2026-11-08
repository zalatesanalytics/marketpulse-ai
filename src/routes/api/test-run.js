import { createFileRoute } from "@tanstack/react-router";
import { runPublicAnalysis } from "@/lib/analysis.server";

export const Route = createFileRoute("/api/test-run")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const result = await runPublicAnalysis({
          base44: context.getBase44().asServiceRole,
          messages: [{ role: "user", content: "Nike" }],
        });
        if (!result.ok) return Response.json(result);
        return Response.json({
          ok: true,
          brand: result.research.brand,
          totalRead: result.research.total_scraped,
          ranked: result.posts.length,
          platforms: result.posts.reduce((acc, p) => ({ ...acc, [p.platform]: (acc[p.platform] || 0) + 1 }), {}),
          zeroMetrics: result.posts.filter((p) => !p.engagement && !p.comments && !p.views).length,
          dated: result.posts.filter((p) => p.published_at).length,
          sample: result.posts.slice(0, 3).map((p) => ({
            platform: p.platform,
            title: p.title.slice(0, 60),
            engagement: p.engagement,
            comments: p.comments,
            views: p.views,
            date: p.published_at,
            sentiment: p.sentiment,
          })),
          warnings: result.research.warnings,
          summary: (result.research.summary || "").slice(0, 160),
        });
      },
    },
  },
});