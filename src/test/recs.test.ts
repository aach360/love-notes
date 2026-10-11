import { describe, expect, it } from "vitest";
import { buildDemoEvents } from "@/test/fixtures/demo-events";
import {
  applySwipe,
  emptyPreferences,
  getRecommendations,
} from "@/modules/recommendations/ranking";
import { emptyUserState, normalizeUserState } from "@/modules/recommendations/storage";

const now = new Date("2026-10-10T16:00:00Z");
const events = buildDemoEvents(now);
const filters = { date: "any" as const, category: null, confirmedFreeOnly: false };
const input = { events, swipes: [], prefs: emptyPreferences(), filters, now };

describe("fixed-weight recommendations", () => {
  it("excludes planned and swiped events and obeys hard filters", () => {
    const e = events[0]!;
    const ranked = getRecommendations({
      ...input,
      planIds: [e.id],
      swipes: [{ eventId: events[1]!.id, direction: "pass", at: now.toISOString() }],
      filters: { ...filters, confirmedFreeOnly: true },
    });
    expect(
      ranked.every(
        (r) => r.event.id !== e.id && r.event.id !== events[1]!.id && r.event.costAmount === 0,
      ),
    ).toBe(true);
  });

  it("keeps the visible card across a feed refresh but removes it after feedback", () => {
    const ranked = getRecommendations(input);
    const pinned = ranked.at(-1)!.event.id;
    expect(getRecommendations({ ...input, frozenId: pinned })[0]!.event.id).toBe(pinned);
    expect(
      getRecommendations({
        ...input,
        frozenId: pinned,
        swipes: [{ eventId: pinned, direction: "like", at: now.toISOString() }],
      }).some((r) => r.event.id === pinned),
    ).toBe(false);
  });

  it("produces stable finite scores without provider vectors", () => {
    expect(getRecommendations(input)).toEqual(getRecommendations(input));
    expect(getRecommendations(input).every((r) => Number.isFinite(r.score))).toBe(true);
  });

  it("only explains interests supported by actual likes", () => {
    expect(getRecommendations(input).every((r) => r.reason === null)).toBe(true);
    const prefs = applySwipe(emptyPreferences(), events[0]!, "like");
    expect(
      getRecommendations({ ...input, prefs }).some((r) =>
        r.reason?.startsWith("Because you liked"),
      ),
    ).toBe(true);
  });

  it("preserves saved state while dropping a retired model", () => {
    const state = emptyUserState();
    const realEvent = { ...events[0]!, isDemo: false };
    const legacy = {
      ...state,
      saved: [{ eventId: realEvent.id, savedAt: now.toISOString(), event: realEvent }],
      prefs: { ...state.prefs, bandit: { version: "old" } },
    };
    const restored = normalizeUserState(legacy);
    expect(restored.saved).toHaveLength(1);
    expect(restored.prefs).not.toHaveProperty("bandit");
  });
});

describe("upcoming events and recurring series", () => {
  const base = events[0]!;
  const occurrence = (id: string, days: number) => ({
    ...base,
    id,
    title: "Sunday club meetup",
    organizer: "Weekly club",
    startsAt: new Date(now.getTime() + days * 86400000).toISOString(),
    endsAt: new Date(now.getTime() + days * 86400000 + 3600000).toISOString(),
  });
  it("prioritizes this week over strong interests several weeks away", () => {
    const soon = { ...occurrence("soon", 1), title: "New activity", topics: [] };
    const later = { ...occurrence("later", 28), title: "Favorite activity", topics: ["arts"] };
    const ranked = getRecommendations({
      ...input,
      events: [later, soon],
      prefs: { ...emptyPreferences(), weights: { "topic:arts": 1000 } },
    });
    expect(ranked[0]?.event.id).toBe("soon");
  });
  it("shows only the nearest occurrence, including after it is saved or planned", () => {
    const series = [occurrence("first", 1), occurrence("second", 8), occurrence("third", 15)];
    expect(getRecommendations({ ...input, events: series }).map((item) => item.event.id)).toEqual([
      "first",
    ]);
    expect(
      getRecommendations({
        ...input,
        events: series,
        swipes: [{ eventId: "first", direction: "like", at: now.toISOString() }],
      }),
    ).toEqual([]);
    expect(getRecommendations({ ...input, events: series, planIds: ["first"] })).toEqual([]);
    expect(
      getRecommendations({
        ...input,
        events: series,
        now: new Date(now.getTime() + 2 * 86400000),
      })[0]?.event.id,
    ).toBe("second");
  });
  it("keeps different activities from the same club eligible", () => {
    const meetup = occurrence("meetup", 1);
    const workshop = { ...occurrence("workshop", 2), title: "Workshop" };
    expect(getRecommendations({ ...input, events: [meetup, workshop] })).toHaveLength(2);
  });
});
