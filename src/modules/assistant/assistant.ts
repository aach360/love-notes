import type { DateFilter, PulseEvent } from "@/shared/types";
import { matchesDateFilter } from "@/shared/time";
import { isConfirmedFree } from "@/modules/recommendations/ranking";

export interface AssistantAnswer {
  text: string;
  events: Pick<PulseEvent, "id" | "title" | "startsAt" | "endsAt" | "location" | "sourceUrl" | "isDemo">[];
  /** How the question was interpreted — shown for transparency. */
  interpretation: string;
}

/**
 * askAssistant: deterministic, grounded in stored events only. Replaceable —
 * an LLM version must keep the rule: answer only from `events`, include source links.
 */
export function askAssistant(question: string, events: PulseEvent[], now = new Date()): AssistantAnswer {
  const q = question.toLowerCase();
  let date: DateFilter = "any";
  if (/\btoday|tonight\b/.test(q)) date = "today";
  else if (/\btomorrow\b/.test(q)) date = "tomorrow";
  else if (/\bweekend\b/.test(q)) date = "weekend";
  else if (/\bthis week|next few days\b/.test(q)) date = "week";
  const free = /\bfree\b/.test(q) && !/free food/.test(q);
  const food = /\bfood|snack|pizza|eat\b/.test(q);
  const stop = new Set(["what", "whats", "what's", "happening", "find", "events", "event", "this", "weekend", "today", "tonight", "tomorrow", "free", "the", "any", "are", "there", "for", "me", "show", "week", "is", "on", "a", "an", "and", "of", "in", "to", "some"]);
  const words = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w) && !["food", "snack", "eat"].includes(w));

  let matches = events.filter((e) => matchesDateFilter(e, date, now));
  if (free) matches = matches.filter(isConfirmedFree);
  if (food) matches = matches.filter((e) => e.tags.includes("free food"));
  if (words.length) {
    const hay = (e: PulseEvent) => [e.title, e.description ?? "", e.organizer ?? "", ...e.categories, ...e.tags].join(" ").toLowerCase();
    const kw = matches.filter((e) => words.some((w) => hay(e).includes(w)));
    if (kw.length) matches = kw;
    else if (date === "any" && !free && !food) matches = [];
  }
  matches = matches.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);

  const parts = [
    date !== "any" ? `date: ${date}` : null,
    free ? "confirmed free admission" : null,
    food ? "lists free food" : null,
    words.length ? `keywords: ${words.join(", ")}` : null,
  ].filter(Boolean);
  const interpretation = parts.length ? parts.join(" · ") : "all upcoming events";

  const text = matches.length
    ? `I found ${matches.length} event${matches.length > 1 ? "s" : ""} matching ${interpretation}.`
    : `I couldn't find any stored events matching ${interpretation}.${free ? " Note: Heel Life rarely lists admission cost, so few events are confirmed free." : ""}`;

  return {
    text,
    interpretation,
    events: matches.map(({ id, title, startsAt, endsAt, location, sourceUrl, isDemo }) => ({ id, title, startsAt, endsAt, location, sourceUrl, isDemo })),
  };
}
