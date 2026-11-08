import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readPublicAnalysis, startPublicAnalysis } from "@/lib/analysis.server";

const PLATFORM_ENUM = z.enum(["reddit", "x", "youtube"]);

const MessagesInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(16),
});

const BriefInput = z.object({
  brand: z.string().min(1).max(80),
  category: z.string().max(120),
  competitors: z.array(z.string().max(60)).max(3),
  goal: z.string().max(300),
});

const RunsInput = z
  .array(z.object({ platform: PLATFORM_ENUM, runId: z.string().min(1).max(80) }))
  .min(1)
  .max(3);

// Deliberately public: a visitor on the shared chat link can ask for one ranked read
// of the public conversation, with no account. Input is bounded on purpose.
// Split in two so no single request has to hold the whole scrape: the first starts
// the crawls and returns, the second is polled until the results are ready.
export const startPublicCheck = createServerFn({ method: "POST" })
  .validator(MessagesInput)
  .handler(({ data, context }) =>
    startPublicAnalysis({ base44: context.getBase44().asServiceRole, messages: data.messages })
  );

export const readPublicCheck = createServerFn({ method: "POST" })
  .validator(z.object({ brief: BriefInput, runs: RunsInput }))
  .handler(({ data, context }) =>
    readPublicAnalysis({ base44: context.getBase44().asServiceRole, brief: data.brief, runs: data.runs })
  );