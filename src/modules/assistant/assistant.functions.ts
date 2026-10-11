import { createServerFn } from "@tanstack/react-start";
import type { AssistantAnswer } from "./assistant";
export const askAssistantAI = createServerFn({ method: "POST" })
  .inputValidator((d: { question: string }) => {
    const q = typeof d?.question === "string" ? d.question.trim() : "";
    if (!q) throw new Error("Ask something first.");
    return { question: q.slice(0, 300) };
  })
  .handler(async ({ data }): Promise<AssistantAnswer> => {
    const { answerFromFeed } = await import("./answer.server");
    return answerFromFeed(data.question);
  });
