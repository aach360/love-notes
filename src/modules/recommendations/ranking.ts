import { hasEnded, startsTodayOrFuture } from "@/shared/time";
import type { EventFilters, PulseEvent, RankedEvent, Swipe, UserPreferences } from "@/shared/types";
import { benefitLabel, formatLabel, topicLabel } from "@/shared/taxonomy";
import { matchesDateFilter } from "@/shared/time";
import { matchesEventType } from "@/shared/eventTypes";

/** Public recommendation API. Hard filters run before fixed-weight scoring. */

/**
 * Weight per key kind. Classified taxonomy topics carry the strongest signal;
 * vague source categories ("Community Building", "Thoughtful Learning") are
 * deliberately weak so they can't dominate recommendations.
 */
export const LIKE_WEIGHT = { topic: 1.0, ben: 0.8, fmt: 0.5, cat: 0.25, tag: 0.4 };
export const PASS_WEIGHT = { topic: -0.35, ben: -0.15, fmt: -0.15, cat: -0.1, tag: -0.15 };

export const emptyPreferences = (): UserPreferences => ({
  weights: {},
  likeCounts: {},
  remindersOptIn: false,
});

const keyKind = (k: string) => k.slice(0, k.indexOf(":")) as keyof typeof LIKE_WEIGHT;

export function featureKeys(e: PulseEvent): string[] {
  // Unique: a repeated source tag counts once.
  return [
    ...new Set([
      ...(e.topics ?? []).map((t) => `topic:${t}`),
      ...(e.formats ?? []).map((f) => `fmt:${f}`),
      ...(e.benefits ?? []).map((b) => `ben:${b}`),
      ...e.categories.map((c) => `cat:${c.toLowerCase()}`),
      ...e.tags.map((t) => `tag:${t.trim().toLowerCase()}`),
    ]),
  ];
}

export function keyLabel(k: string) {
  const id = k.slice(k.indexOf(":") + 1);
  if (k.startsWith("topic:")) return topicLabel(id);
  if (k.startsWith("fmt:")) return formatLabel(id);
  if (k.startsWith("ben:")) return benefitLabel(id);
  return id;
}

/** Pure: returns new preferences after a swipe. */
export function applySwipe(
  prefs: UserPreferences,
  event: PulseEvent,
  dir: Swipe["direction"],
): UserPreferences {
  const weights = { ...prefs.weights };
  const likeCounts = { ...prefs.likeCounts };
  for (const k of new Set(featureKeys(event))) {
    const kind = keyKind(k);
    const delta = dir === "like" ? LIKE_WEIGHT[kind] : PASS_WEIGHT[kind];
    weights[k] = Math.round(((weights[k] ?? 0) + delta) * 100) / 100;
    if (dir === "like") likeCounts[k] = (likeCounts[k] ?? 0) + 1;
  }
  return { ...prefs, weights, likeCounts };
}

/** Deterministic per-event jitter in [0,1) so the starting feed is varied but stable. */
function jitter(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function isConfirmedFree(e: PulseEvent) {
  return e.costAmount === 0;
}

export function applyFilters(
  events: PulseEvent[],
  f: EventFilters,
  now = new Date(),
): PulseEvent[] {
  return events.filter(
    (e) =>
      !hasEnded(e, now) &&
      startsTodayOrFuture(e, now) &&
      matchesDateFilter(e, f.date, now) &&
      matchesEventType(e, f.category) &&
      (!f.confirmedFreeOnly || isConfirmedFree(e)),
  );
}

export function explain(e: PulseEvent, prefs: UserPreferences): string | null {
  let best: string | null = null;
  let bestW = 0;
  for (const k of featureKeys(e)) {
    const w = prefs.weights[k] ?? 0;
    if ((prefs.likeCounts[k] ?? 0) > 0 && w > bestW) {
      best = k;
      bestW = w;
    }
  }
  return best ? `Because you liked ${keyLabel(best)}` : null;
}

/** Additive category/topic weights with timing and variety. */
export function baselineRecommendations(input: {
  events: PulseEvent[];
  swipes: Swipe[];
  prefs: UserPreferences;
  filters: EventFilters;
  now?: Date;
}): RankedEvent[] {
  const now = input.now ?? new Date();
  const swiped = new Set(input.swipes.map((s) => s.eventId));
  // Keep only the nearest occurrence of the same titled series, even after it
  // is swiped. The next occurrence becomes eligible after that one ends.
  const eligible = applyFilters(input.events, input.filters, now);
  const series = (event: PulseEvent) =>
    JSON.stringify([
      event.organizer?.trim().toLowerCase() || event.location?.trim().toLowerCase() || "",
      event.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
    ]);
  const nearest = new Map<string, PulseEvent>();
  for (const event of eligible) {
    const key = series(event);
    const previous = nearest.get(key);
    if (!previous || event.startsAt < previous.startsAt) nearest.set(key, event);
  }
  const pool = [...nearest.values()].filter((e) => !swiped.has(e.id));
  const urgency = (event: PulseEvent) => {
    const days = Math.max(0, (Date.parse(event.startsAt) - now.getTime()) / 86400000);
    return days <= 2 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 3 : 4;
  };
  const scored = pool.map((event) => {
    const keys = new Set(featureKeys(event));
    let pref = 0;
    for (const k of keys) pref += input.prefs.weights[k] ?? 0;
    const hoursAway = Math.max(0, (new Date(event.startsAt).getTime() - now.getTime()) / 3600_000);
    const soon = 1 / (1 + hoursAway / 48);
    const score = Math.tanh(pref / 4) * 2 + soon * 2 + jitter(event.id) * 0.2;
    return { event, score: Math.round(score * 100) / 100, reason: explain(event, input.prefs) };
  });
  scored.sort((a, b) => urgency(a.event) - urgency(b.event) || b.score - a.score);
  const out: RankedEvent[] = [];
  const rest = [...scored];
  while (rest.length) {
    const lastTwo = out.slice(-2).map((r) => r.event.categories[0]);
    let idx = 0;
    if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1]) {
      const alt = rest.findIndex(
        (r) => urgency(r.event) === urgency(rest[0]!.event) && r.event.categories[0] !== lastTwo[0],
      );
      if (alt > 0) idx = alt;
    }
    out.push(rest.splice(idx, 1)[0]!);
  }
  return out;
}

/** Fixed category/topic weights, timing and variety; no model or external service. */
export function getRecommendations(
  input: Parameters<typeof baselineRecommendations>[0] & {
    planIds?: string[];
    frozenId?: string | null;
  },
): RankedEvent[] {
  const planned = new Set(input.planIds ?? []);
  const ranked = baselineRecommendations(input).filter((item) => !planned.has(item.event.id));
  const idx = ranked.findIndex((r) => r.event.id === input.frozenId);
  if (idx > 0) ranked.unshift(ranked.splice(idx, 1)[0]!);
  return ranked;
}
