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
