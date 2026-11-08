import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import FeedbackForm from "@/components/feedback/FeedbackForm";

export const Route = createFileRoute("/client-feedback")({
  component: ClientFeedbackPage,
  head: () => ({
    meta: [
      { title: "Leave a note — Signal Desk" },
      {
        name: "description",
        content: "Testing Signal Desk? Send the research desk what worked, what broke and what you would change.",
      },
    ],
  }),
});

function ClientFeedbackPage() {
  return (
    <div className="min-h-screen bg-background px-5 py-10 md:py-16">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <Radar className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-medium tracking-tight">Signal Desk</span>
        </div>

        <header className="mt-8">
          <h1 className="font-display text-[32px] leading-[1.08] tracking-[-0.01em] md:text-[38px]">
            Tell us how the test went.
          </h1>
          <p className="mt-3 max-w-[440px] text-[13.5px] leading-relaxed text-muted-foreground">
            You are looking at the research desk before it goes live. Leave a note about what you tried, what broke, or
            what you expected to see — it comes straight to us.
          </p>
        </header>

        <div className="mt-7">
          <FeedbackForm />
        </div>

        <p className="mt-5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          No account needed · your note is only read by the research desk
        </p>
      </div>
    </div>
  );
}