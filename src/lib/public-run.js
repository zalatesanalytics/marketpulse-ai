import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runPublicAnalysis } from "@/lib/analysis.server";

// Deliberately public: a visitor on the shared chat link can ask for one ranked read
// of the public conversation, with no account. Input is bounded on purpose.
export const runPublicCheck = createServerFn({ method: "POST" })
  .validator(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(2000),
          })
        )
        .min(1)
        .max(16),
    })
  )
  .handler(({ data, context }) =>
    runPublicAnalysis({ base44: context.getBase44().asServiceRole, messages: data.messages })
  );