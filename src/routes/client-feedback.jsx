import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import ClientChat from "@/components/feedback/ClientChat";

export const Route = createFileRoute("/client-feedback")({
  component: ClientFeedbackPage,
  head: () => ({
    meta: [
      { title: "Talk to the desk — Signal Desk" },
      {
        name: "description",
        content: "Chat with the Signal Desk assistant about what people are saying about your brand — no account needed.",
      },
    ],
  }),
});

function ClientFeedbackPage() {
  return (
    <div className="min-h-screen bg-background px-5 py-8 md:py-14">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <Radar className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-medium tracking-tight">Signal Desk</span>
        </div>

        <header className="mt-6">
          <h1 className="font-display text-[30px] leading-[1.1] tracking-[-0.01em] md:text-[36px]">
            I can help you read what’s happening in what you think.
          </h1>
          <p className="mt-3 max-w-[440px] text-[13.5px] leading-relaxed text-muted-foreground">
            Ask about your brand, your category or a competitor. Start with a question — no account, no sign-up.
          </p>
        </header>

        <div className="mt-6">
          <ClientChat />
        </div>

        <p className="mt-4 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          No account needed · the research desk reads every question
        </p>
      </div>
    </div>
  );
}