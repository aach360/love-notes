import type { PulseEvent } from "./types";

/** A few high-yield Type buckets shown in filters instead of raw source categories. */
export const EVENT_TYPES = [
  "On campus",
  "Carrboro & local",
  "Music & arts",
  "Sports & fitness",
  "Career & academic",
  "Social & food",
] as const;

const CAMPUS_SOURCES = new Set(["heellife-json", "heellife-rss", "unc-calendar", "ackland", "morehead", "unc-libraries"]);
const LOCAL_SOURCES = new Set(["carrboro", "orange-county", "ticketmaster"]);

const WORDS: Record<string, string[]> = {
  "Music & arts": ["music", "concert", "band", "jazz", "choir", "orchestra", "art", "gallery", "exhibit", "museum", "theater", "theatre", "dance", "film", "screening", "poetry", "performance"],
  "Sports & fitness": ["basketball", "football", "soccer", "baseball", "tennis", "volleyball", "game", "intramural", "yoga", "fitness", "run", "5k", "workout", "hike", "climb"],
  "Career & academic": ["career", "internship", "resume", "networking", "job", "lecture", "seminar", "talk", "workshop", "research", "symposium", "colloquium", "study", "panel"],
  "Social & food": ["social", "mixer", "party", "festival", "meetup", "hangout", "food", "pizza", "dinner", "lunch", "breakfast", "snack", "potluck", "cookout", "trivia"],
};

function text(e: PulseEvent) {
  const x = e as PulseEvent & { topics?: string[] };
  return [e.title, e.description, e.location, ...e.categories, ...e.tags, ...(x.topics ?? [])].join(" ").toLowerCase();
}

export function matchesEventType(e: PulseEvent, type: string | null): boolean {
  if (!type) return true;
  if (type === "On campus") return CAMPUS_SOURCES.has(e.source);
  if (type === "Carrboro & local") {
    if (LOCAL_SOURCES.has(e.source)) return true;
    const loc = (e.location ?? "").toLowerCase();
    return /carrboro|durham|hillsborough|franklin st/.test(loc);
  }
  const words = WORDS[type];
  if (!words) return e.categories.includes(type);
  const t = text(e);
  return words.some((w) => new RegExp(`\\b${w}`).test(t));
}
