import { describe, expect, it } from "vitest";
import type { PulseEvent, Swipe } from "@/shared/types";
import { emptyPreferences, getRecommendations } from "@/modules/recommendations/ranking";
import { isExplorationSlot } from "@/modules/recommendations/engine";

const now = new Date("2026-10-12T14:00:00Z");
const F = { date: "any" as const, category: null, confirmedFreeOnly: false };
function ev(id: string, topic: string, hours = 30, extra: Partial<PulseEvent> = {}): PulseEvent {
  return {
    id, source: "unc-calendar", sourceEventId: id, sourceOccurrenceId: null, sourceUrl: null, title: `${topic} ${id}`, description: null,
    startsAt: new Date(now.getTime() + hours * 3_600_000).toISOString(), endsAt: null, allDay: false, timezone: "America/New_York",
    location: null, organizer: null, hosts: [], imageUrl: null, categories: [topic], tags: [], topics: [topic], costAmount: null, costText: null,
    eligibility: null, status: "scheduled", sourceStatus: null, lastFetchedAt: now.toISOString(), isDemo: false, ...extra,
  } as PulseEvent;
}
const events = [
  ...Array.from({ length: 12 }, (_, i) => ev(`m${i}`, "live-music", 10 + i)),
  ev("x1", "basketball", 40), ev("x2", "career", 41), ev("x3", "career", 42, { costAmount: 0 }),
];
const likes = (n: number): Swipe[] => Array.from({ length: n }, (_, i) => ({ eventId: `p${i}`, direction: "like", at: now.toISOString(), event: ev(`p${i}`, "live-music") }));
const rec = (swipes: Swipe[], extra: object = {}) => getRecommendations({ events, swipes, prefs: emptyPreferences(), filters: F, now, ...extra });

describe("exploration policy", () => {
  it("about 15% of slots, never back-to-back", () => {
    const slots = Array.from({ length: 100 }, (_, k) => isExplorationSlot(k));
    expect(slots.filter(Boolean).length).toBe(15);
    for (let k = 1; k < 100; k++) expect(slots[k] && slots[k - 1]).toBe(false);
  });

  it("puts an underexplored topic on an exploration slot, labeled honestly, without double-counting", () => {
    const r = rec(likes(6)); // slot 6 is exploratory
    expect(r[0]!.breakdown!.exploratory).toBe(true);
    expect(r[0]!.event.topics).not.toContain("live-music");
    expect(r[0]!.reason).toBe("Something new to try");
    expect(r[0]!.breakdown!.exploration).toBe(0);
    expect(r.filter((x) => x.breakdown!.exploratory).length).toBeLessThanOrEqual(Math.ceil(r.length * 0.2));
  });

  it("does not explore on a non-slot or right after an exploratory card", () => {
    expect(rec(likes(5))[0]!.breakdown!.exploratory).toBeFalsy();
    const s = likes(6);
    s[5] = { ...s[5]!, exploratory: true };
    // n=6 is a slot, but previous card was exploratory
    expect(rec(s)[0]!.breakdown!.exploratory).toBeFalsy();
  });

  it("respects filters", () => {
    const r = rec(likes(6), { filters: { ...F, confirmedFreeOnly: true } });
    expect(r.every((x) => x.event.costAmount === 0)).toBe(true);
  });

  it("one pass is weak; repeated passes stop exploring that topic", () => {
    const pass = (id: string): Swipe => ({ eventId: id, direction: "pass", at: now.toISOString(), event: ev(id, "basketball"), exploratory: true });
    const two = [...likes(4), pass("b1"), pass("b2")];
    const r = rec(two);
    expect(r.filter((x) => x.breakdown!.exploratory).every((x) => !x.event.topics!.includes("basketball"))).toBe(true);
  });

  it("keeps the visible card stable and its label unchanged", () => {
    const s = likes(6);
    const first = rec(s)[0]!;
    const again = rec(s, { frozenId: first.event.id, vectors: { m0: new Array(64).fill(0.1) } })[0]!;
    expect(again.event.id).toBe(first.event.id);
    expect(again.breakdown!.exploratory).toBe(first.breakdown!.exploratory);
  });
});
