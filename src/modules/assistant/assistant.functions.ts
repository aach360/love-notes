import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const askRameses = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(1000),
        history: z
          .array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(3000) }))
          .max(8)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getFeed } = await import("@/modules/ingestion/importer");
    const { searchEvents } = await import("./messaging/event-search");
    const feed = await getFeed();
    const matches = searchEvents(data.question, feed.events);
    const ids = new Set(matches.events.map((event) => event.id));
    const events = feed.events.filter((event) => ids.has(event.id));
    const fallback = {
      status: "unconfigured" as const,
      text: "My AI chat isn’t connected yet, but I can show matching campus events. Use Saved to shortlist events, Calendar to plan, and Clubs to chat with your group.",
      events,
    };
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return fallback;
    const { generateReply } = await import("./gemini.server");
    return generateReply(key, data, events);
  });
