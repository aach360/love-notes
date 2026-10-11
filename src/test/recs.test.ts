import { describe, expect, it } from "vitest";
import type { PulseEvent, Swipe } from "@/shared/types";
import { BANDIT_DIMS, banditFeatures, banditModel, cholesky, emptyBandit, ensureBandit, updateBandit } from "@/modules/recommendations/bandit";
import { emptyPreferences, getRecommendations } from "@/modules/recommendations/ranking";
import { createLocalStorage, emptyUserState } from "@/modules/recommendations/storage";
import { cosine, normalize } from "@/modules/recommendations/vectors";
import { REC_CONFIG } from "@/modules/recommendations/config";

const now = new Date("2026-10-12T14:00:00Z");
const F = { date: "any" as const, category: null, confirmedFreeOnly: false };

function ev(id: string, cat: string, hoursAhead = 30, extra: Partial<PulseEvent> = {}): PulseEvent {
  return {
    id, source: "unc-calendar", sourceEventId: id, sourceOccurrenceId: null, sourceUrl: null, title: `${cat} event ${id}`, description: null,
    startsAt: new Date(now.getTime() + hoursAhead * 3_600_000).toISOString(), endsAt: null, allDay: false, timezone: "America/New_York",
    location: null, organizer: null, hosts: [], imageUrl: null, categories: [cat], tags: [cat.toLowerCase()], costAmount: null, costText: null,
    eligibility: null, status: "scheduled", sourceStatus: null, lastFetchedAt: now.toISOString(), isDemo: false, ...extra,
  } as PulseEvent;
}
/** Synthetic semantic vectors: topic axis + small deterministic offset. */
function vec(topic: number, k: number): number[] {
  const v = new Array(REC_CONFIG.semanticDims).fill(0);
  v[topic] = 1;
  v[(topic + 7 + k) % REC_CONFIG.semanticDims] = 0.15;
  return normalize(v)!;
}

describe("bandit numerics", () => {
  it("stays positive definite and finite after many updates", () => {
    let s = emptyBandit();
    const x = new Array(BANDIT_DIMS).fill(0).map((_, i) => (i % 3 === 0 ? 0.5 : 0.1));
    for (let i = 0; i < 500; i++) s = updateBandit(s, x, (i % 2) as 0 | 1);
    expect(() => cholesky(s.A, s.d)).not.toThrow();
    const m = banditModel(s);
    expect(Number.isFinite(m.predict(x))).toBe(true);
    expect(m.uncertainty(x)).toBeGreaterThan(0);
    expect(m.uncertainty(x)).toBeLessThan(banditModel(emptyBandit()).uncertainty(x));
  });
  it("ignores malformed feature vectors", () => {
    const s = updateBandit(emptyBandit(), [1, 2, NaN], 1);
    expect(s.n).toBe(0);
  });
  it("learns: liked direction gets a higher predicted reward", () => {
    const a = ev("a", "Music");
    const b = ev("b", "Lectures");
    const xa = banditFeatures(a, vec(1, 0), now);
    const xb = banditFeatures(b, vec(9, 0), now);
    let s = emptyBandit();
    for (let i = 0; i < 4; i++) {
      s = updateBandit(s, xa, 1);
      s = updateBandit(s, xb, 0);
    }
    const m = banditModel(s);
    expect(m.predict(xa)).toBeGreaterThan(m.predict(xb));
  });
});

describe("persistence + version migration", () => {
  it("old states without bandit load; stale feature versions reset only the bandit", () => {
    const mem = new Map<string, string>();
    const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const st = { ...emptyUserState(), swipes: [{ eventId: "x", direction: "like" as const, at: "t" }] };
    st.prefs = { ...st.prefs, bandit: { version: "old", d: 3, A: [1], b: [0], n: 9 } };
    createLocalStorage(ls).save(st);
    const loaded = createLocalStorage(ls).load();
    expect(loaded.swipes).toHaveLength(1);
    expect(loaded.prefs.bandit!.version).toBe(REC_CONFIG.featureVersion);
    expect(loaded.prefs.bandit!.n).toBe(0);
    expect(ensureBandit(undefined).d).toBe(BANDIT_DIMS);
  });
});

describe("hybrid ranking", () => {
  const music = [0, 1, 2, 3, 4].map((i) => ev(`m${i}`, "Music", 20 + i));
  const talks = [0, 1, 2, 3, 4].map((i) => ev(`t${i}`, "Lectures", 22 + i));
  const sports = [0, 1, 2].map((i) => ev(`s${i}`, "Athletics", 24 + i));
  const events = [...music, ...talks, ...sports];
  const vectors: Record<string, number[]> = {};
  music.forEach((e, i) => (vectors[e.id] = vec(1, i)));
  talks.forEach((e, i) => (vectors[e.id] = vec(9, i)));
  sports.forEach((e, i) => (vectors[e.id] = vec(20, i)));

  it("hard filters: swiped, planned, cancelled, ended-free and category are enforced", () => {
    const r = getRecommendations({
      events: [...events, ev("c", "Music", 5, { status: "cancelled" })],
      swipes: [{ eventId: "m0", direction: "like", at: now.toISOString() }],
      prefs: emptyPreferences(), filters: { ...F, category: "Music" }, now, vectors, planIds: ["m1"],
    });
    const ids = r.map((x) => x.event.id);
    expect(ids).not.toContain("m0");
    expect(ids).not.toContain("m1");
    expect(ids).not.toContain("c");
    expect(r.every((x) => x.event.categories.includes("Music"))).toBe(true);
    const free = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters: { ...F, confirmedFreeOnly: true }, now });
    expect(free).toHaveLength(0); // unknown cost is never "free"
  });

  it("likes pull semantically similar events up, with an honest reason", () => {
    const swipes: Swipe[] = [{ eventId: "m0", direction: "like", at: now.toISOString() }, { eventId: "m1", direction: "like", at: now.toISOString() }];
    let bandit = emptyBandit();
    for (const id of ["m0", "m1"]) bandit = updateBandit(bandit, banditFeatures(events.find((e) => e.id === id)!, vectors[id], now), 1);
    const r = getRecommendations({ events, swipes, prefs: { ...emptyPreferences(), bandit }, filters: F, now, vectors });
    expect(r[0]!.event.categories).toContain("Music");
    expect(r[0]!.reason).toMatch(/Similar to events you saved|recent interest/);
    const cold = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters: F, now, vectors });
    expect(cold.every((x) => !/saved|interest/.test(x.reason ?? ""))).toBe(true);
  });

  it("diversity: top 5 isn't all one topic when alternatives exist", () => {
    const swipes: Swipe[] = [{ eventId: "m0", direction: "like", at: now.toISOString() }];
    const r = getRecommendations({ events, swipes, prefs: emptyPreferences(), filters: F, now, vectors });
    const cats = new Set(r.slice(0, 5).map((x) => x.event.categories[0]));
    expect(cats.size).toBeGreaterThan(1);
  });

  it("missing embeddings fall back to tags and say so", () => {
    const r = getRecommendations({ events, swipes: [{ eventId: "m0", direction: "like", at: now.toISOString() }], prefs: emptyPreferences(), filters: F, now });
    expect(r.every((x) => x.breakdown!.mode === "tag-fallback")).toBe(true);
    expect(r.slice(0, 3).some((x) => x.event.categories[0] === "Music")).toBe(true);
  });

  it("frozen card stays on top when vectors arrive", () => {
    const before = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters: F, now });
    const top = before[0]!.event.id;
    const after = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters: F, now, vectors, frozenId: top });
    expect(after[0]!.event.id).toBe(top);
  });

  it("repeats collapse to the soonest occurrence; swiping one hides the series", () => {
    const later = ev("x3", "Music", 34, { title: "Jazz Night" });
    const a = ev("x1", "Music", 10, { title: "Jazz Night" });
    const dup = ev("x2", "Music", 10, { title: "Jazz  night!" });
    const other = ev("y1", "Sports", 12, { title: "Pickup Soccer" });
    const events = [later, a, dup, other];
    const ids = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters: F, now }).map((x) => x.event.id);
    expect(ids.sort()).toEqual(["x1", "y1"]);
    const swipes: Swipe[] = [{ eventId: "x1", direction: "pass", at: now.toISOString() }];
    const after = getRecommendations({ events, swipes, prefs: emptyPreferences(), filters: F, now }).map((x) => x.event.id);
    expect(after).toEqual(["y1"]);
  });

  it("zero vectors are safe", () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(normalize([0, 0])).toBeNull();
  });
});
