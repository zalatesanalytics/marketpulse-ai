import { createFileRoute } from "@tanstack/react-router";
import DeskLanding from "@/components/feedback/DeskLanding";

export const Route = createFileRoute("/client-feedback")({
  component: DeskLanding,
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