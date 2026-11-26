import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  answerQualityQuestion,
  lookupQualityAnswer,
  readCategoryAnswer,
  startCategoryRead,
} from "@/lib/quality-fns";
import { readPublicCheck, startPublicCheck } from "@/lib/public-run";

const GREETING =
  "Hi — I run the quality desk. Pick any of the forty test questions, or ask your own version of one, and I'll read the live conversation behind it before answering. Every answer says what the sample can and can't show.";

const NEED_CATEGORY =
  "I couldn't pin a brand or a category in that. Name either one — “What are the most discussed footwear brands in Canada?” or “What are the most common complaints about Air Canada?” — and I'll run the read.";

const FAILED = "That read didn’t come back. Try the question again in a moment.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function useQualityChat() {
  const lookup = useServerFn(lookupQualityAnswer);
  const answer = useServerFn(answerQualityQuestion);
  const startCheck = useServerFn(startPublicCheck);
  const readCheck = useServerFn(readPublicCheck);
  const startCategory = useServerFn(startCategoryRead);
  const readCategory = useServerFn(readCategoryAnswer);

  const [messages, setMessages] = useState([
    { id: "greeting", role: "assistant", kind: "text", content: GREETING },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  const push = (message) => setMessages((prev) => [...prev, { ...message, id: `m${prev.length}` }]);

  // No brand in the question: resolve the category, compare the brands in it, answer.
  const runCategoryRead = async (content, category) => {
    setStage("Working out which brands to compare…");
    const resolved = await startCategory({ data: { question: content } });
    if (!resolved.ok) {
      if (resolved.unclear) push({ role: "assistant", kind: "text", content: NEED_CATEGORY });
      else setError(resolved.error || FAILED);
      return;
    }

    setStage("Reading the category conversation on Reddit, X and YouTube…");
    const began = Date.now();
    const deadline = began + 180000;

    while (Date.now() < deadline) {
      await sleep(2500);
      setStage(`Counting brand mentions… ${Math.round((Date.now() - began) / 1000)}s`);
      const step = await readCategory({
        data: {
          question: content,
          category,
          brief: resolved.brief,
          runs: resolved.runs,
          elapsedMs: Date.now() - began,
        },
      });
      if (step.stage === "scraping") continue;
      if (!step.ok) throw new Error(step.error || FAILED);
      push({ role: "assistant", kind: "answer", entry: { ...step.answer, cached: false } });
      return;
    }
    throw new Error(FAILED);
  };

  const ask = async (raw, category = "") => {
    const content = String(raw || "").trim();
    if (!content || busy) return;

    push({ role: "user", kind: "text", content });
    setDraft("");
    setError("");
    setBusy(true);
    setStage("Checking saved answers…");

    try {
      const known = await lookup({ data: { question: content } });
      if (known.found) {
        push({ role: "assistant", kind: "answer", entry: { ...known.answer, cached: true } });
        return;
      }

      setStage("Reading the past 90 days on Reddit, X and YouTube…");
      const started = await startCheck({ data: { messages: [{ role: "user", content }] } });
      if (!started.ok) {
        if (started.needBrand) {
          await runCategoryRead(content, category);
          return;
        }
        setError(started.error || FAILED);
        return;
      }

      const began = Date.now();
      const deadline = began + 180000;
      let result = null;

      while (Date.now() < deadline) {
        await sleep(2500);
        setStage(`Ranking the loudest posts and scoring sentiment… ${Math.round((Date.now() - began) / 1000)}s`);
        const step = await readCheck({
          data: { brief: started.brief, runs: started.runs, elapsedMs: Date.now() - began },
        });
        if (step.stage === "scraping") continue;
        if (step.ok) {
          result = step;
          break;
        }
        throw new Error(step.error || FAILED);
      }
      if (!result) throw new Error(FAILED);

      setStage("Writing the answer from the sample…");
      const answered = await answer({
        data: { question: content, category, research_id: result.research.id },
      });
      if (!answered.ok) throw new Error(answered.error || FAILED);

      push({ role: "assistant", kind: "answer", entry: { ...answered.answer, cached: false } });
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  return { messages, draft, setDraft, busy, stage, error, ask };
}