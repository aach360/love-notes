import type { PulseEvent, Club } from "@/shared/types";
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "unc",
  "chapel",
  "hill",
  "event",
  "events",
  "join",
  "come",
  "https",
  "www",
  "com",
]);
const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
export function matchPoster(text: string, events: PulseEvent[], clubs: Club[]) {
  const words = tokens(text);
  const score = (title: string, description: string) => {
    const primary = tokens(title);
    const secondary = tokens(description);
    return [...words].reduce(
      (sum, word) => sum + (primary.has(word) ? 3 : secondary.has(word) ? 1 : 0),
      0,
    );
  };
  const seenTitles = new Set<string>();
  return {
    events: events
      .map((event) => ({
        event,
        score: score(
          event.title,
          [event.organizer, event.description, event.location].filter(Boolean).join(" "),
        ),
      }))
      .filter((item) => item.score >= 3)
      .sort((a, b) => b.score - a.score || a.event.startsAt.localeCompare(b.event.startsAt))
      .filter(({ event }) => {
        const title = [...tokens(event.title)].join(" ");
        if (seenTitles.has(title)) return false;
        seenTitles.add(title);
        return true;
      })
      .slice(0, 5)
      .map((item) => item.event),
    clubs: clubs
      .map((club) => ({ club, score: score(club.name, club.description ?? "") }))
      .filter((item) => item.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.club),
  };
}
