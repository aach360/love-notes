import { createServerFn } from "@tanstack/react-start";
import { askAssistant, type AssistantAnswer } from "./assistant";
import { formatEventDate } from "@/shared/time";
import type { PulseEvent } from "@/shared/types";

/**
 * askAssistantAI: Rameses' answer writer.
 *
 * Grounding rule (unchanged from the deterministic matcher): the model only ever
 * sees events we actually imported, and every id it names is checked against that
 * list before it reaches the UI. If the gateway is unavailable, unconfigured, or
 * returns junk, we fall back to the local matcher — never a made-up reply.
 */
const MODEL = "openai/gpt-6-astra";
const MAX_CANDIDATES = 30;
const PER_MINUTE = 30;
let windowStart = 0;
let windowCount = 0;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "eventIds"],
  properties: {
    answer: { type: "string" },
    eventIds: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `You are Rameses, the UNC Chapel Hill events helper. You are given a shortlist of real, currently listed campus events.
Rules you never break:
- Talk only about events in the shortlist. Never invent an event, a time, a place, a price, or a link.
- If nothing in the shortlist fits the question, say so plainly in one sentence and suggest one different thing to ask.
- "answer" is 1-3 plain sentences of conversational English. No markdown, no bullet lists, no asterisks, no headings, no emoji.
- "eventIds" holds up to 5 ids from the shortlist, most relevant first, chosen only from the ids you were given. Leave it empty when nothing fits.
- Times are already Eastern. Do not restate a time you were not given.`;

function row(e: PulseEvent): string {
  const bits = [
    `id=${e.id}`,
    formatEventDate(e),
    e.title,
    e.location ? `at ${e.location}` : null,
    e.costAmount === 0 ? "free admission" : e.costText ? `cost: ${e.costText}` : null,
    e.tags.length ? `tags: ${e.tags.slice(0, 4).join(", ")}` : null,
  ].filter(Boolean);
  return `- ${bits.join(" | ")}`;
}

/** Likely matches first, then the nearest upcoming events, capped for prompt size. */
function candidates(question: string, events: PulseEvent[], now: Date): PulseEvent[] {
  const narrow = askAssistant(question, events, now);
  const picked = new Map<string, PulseEvent>();
  for (const e of narrow.events) {
    const full = events.find((x) => x.id === e.id);
    if (full) picked.set(full.id, full);
  }
  for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    if (picked.size >= MAX_CANDIDATES) break;
    picked.set(e.id, e);
  }
  return [...picked.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

async function writeAnswer(question: string, pool: PulseEvent[]): Promise<{ answer: string; eventIds: string[] } | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  if (++windowCount > PER_MINUTE) return null;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions: SYSTEM,
      input: [{ role: "user", content: `Question: ${question}\n\nShortlist:\n${pool.map(row).join("\n")}` }],
      text: { format: { type: "json_schema", name: "assistant_answer", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) {
    console.error("askAssistantAI gateway", res.status);
    return null;
  }
  const raw = await res.text();
  const parts: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string };
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") parts.push(ev.delta);
    } catch {
      /* keep-alive and partial frames */
    }
  }
  try {
    const parsed = JSON.parse(parts.join("")) as { answer?: unknown; eventIds?: unknown };
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
    return {
      answer: parsed.answer.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim(),
      eventIds: Array.isArray(parsed.eventIds) ? parsed.eventIds.filter((x): x is string => typeof x === "string") : [],
    };
  } catch {
    return null;
  }
}

export const askAssistantAI = createServerFn({ method: "POST" })
  .inputValidator((d: { question: string }) => {
    const q = typeof d?.question === "string" ? d.question.trim() : "";
    if (!q) throw new Error("Ask something first.");
    return { question: q.slice(0, 300) };
  })
  .handler(async ({ data }): Promise<AssistantAnswer> => {
    const { getFeed } = await import("@/modules/ingestion/importer");
    const feed = await getFeed();
    const now = new Date();
    const fallback = askAssistant(data.question, feed.events, now);
    if (!feed.events.length) return fallback;

    const pool = candidates(data.question, feed.events, now);
    const ai = await writeAnswer(data.question, pool);
    if (!ai) return fallback;

    // Only ids that really exist in the shortlist survive — the model can't invent an event.
    const byId = new Map(pool.map((e) => [e.id, e]));
    const chosen = ai.eventIds.map((id) => byId.get(id)).filter((e): e is PulseEvent => Boolean(e)).slice(0, 5);
    const events = (chosen.length ? chosen : fallback.events)
      .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location, sourceUrl: e.sourceUrl, isDemo: e.isDemo }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    return { text: ai.answer, interpretation: fallback.interpretation, events, source: "ai" };
  });
