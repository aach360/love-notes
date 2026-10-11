import { DISPLAY_TZ, type DateFilter, type PulseEvent } from "./types";

/** "YYYY-MM-DD" for an instant, in America/New_York. */
export function nyDateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(key: string, n: number): string {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekday(key: string): number {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Offset (ms) of `tz` at instant `d`: local wall clock minus UTC. */
function tzOffsetMs(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` to a UTC Date (DST-correct). */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string = DISPLAY_TZ): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

/** NY midnight (as UTC ISO) for a "YYYY-MM-DD" key. */
export function nyMidnightIso(key: string): string {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, 0).toISOString();
}

export { addDays as addDayKeys };

export function formatEventDate(e: Pick<PulseEvent, "startsAt" | "endsAt"> & { allDay?: boolean | null }): string {
  const start = new Date(e.startsAt);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const t = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TZ,
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  if (e.allDay) {
    if (e.endsAt) {
      const lastDay = new Date(new Date(e.endsAt).getTime() - 1);
      if (nyDateKey(lastDay) !== nyDateKey(start)) {
        const d2 = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, weekday: "short", month: "short", day: "numeric" }).format(lastDay);
        return `${day} – ${d2} · All day`;
      }
    }
    return `${day} · All day`;
  }
  return e.endsAt ? `${day} · ${t(start)} – ${t(new Date(e.endsAt))}` : `${day} · ${t(start)}`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDayHeading(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

/** Does the event occur (start day) within the given relative window? */
export function matchesDateFilter(e: PulseEvent, f: DateFilter, now = new Date()): boolean {
  if (f === "any") return true;
  const today = nyDateKey(now);
  const k = nyDateKey(e.startsAt);
  if (f === "today") return k === today;
  if (f === "tomorrow") return k === addDays(today, 1);
  if (f === "week") return k >= today && k <= addDays(today, 6);
  // weekend: upcoming Sat+Sun (or the current one)
  const wd = weekday(today);
  const sat = wd === 0 ? addDays(today, -1) : addDays(today, (6 - wd + 7) % 7);
  const sun = addDays(sat, 1);
  return k >= sat && k <= sun && k >= today;
}

/**
 * Uses the known end time. With no end time we never invent a duration: the event is
 * only treated as over (discovery policy) once its start day in New York has passed.
 */
export function hasEnded(e: Pick<PulseEvent, "startsAt" | "endsAt">, now = new Date()): boolean {
  if (e.endsAt) return new Date(e.endsAt).getTime() <= now.getTime();
  return nyDateKey(e.startsAt) < nyDateKey(now);
}

/**
 * Discover start-date rule: the occurrence's start date in America/New_York must be
 * today or later. An event that started yesterday stays excluded even if it continues
 * today. An invalid start is ineligible (never substituted with import time).
 */
export function startsTodayOrFuture(e: Pick<PulseEvent, "startsAt">, now = new Date()): boolean {
  const t = new Date(e.startsAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nyDateKey(e.startsAt) >= nyDateKey(now);
}

/** Full current-time eligibility shared by Cards and Map (before user filters). */
export function isEligibleForDiscover(e: Pick<PulseEvent, "startsAt" | "endsAt" | "status">, now = new Date()): boolean {
  if (e.status === "cancelled") return false;
  if (!startsTodayOrFuture(e, now)) return false;
  return !hasEnded(e, now);
}
