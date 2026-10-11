/**
 * Synthetic sanity check: baseline additive ranker vs hybrid engine.
 * Run: bun scripts/eval-recs.ts
 * NOT evidence of real-world satisfaction — labelled fixtures + a scripted user.
 * Training swipes come from a TRAIN pool; NDCG/coverage are measured on a disjoint EVAL pool.
 */
import type { PulseEvent, Swipe, UserPreferences } from "../src/shared/types";
import { applySwipe, baselineRecommendations, emptyPreferences, getRecommendations } from "../src/modules/recommendations/ranking";
import { banditFeatures, updateBandit, ensureBandit } from "../src/modules/recommendations/bandit";
import { mulberry32, normalize } from "../src/modules/recommendations/vectors";
import { REC_CONFIG } from "../src/modules/recommendations/config";

const now = new Date("2026-10-12T14:00:00Z");
const TOPICS = ["Music", "Tech", "Art", "Sports", "Service", "Food"];
const rnd = mulberry32(7);
const F = { date: "any" as const, category: null, confirmedFreeOnly: false };

function makeEvent(id: string, topic: number, i: number): PulseEvent {
  // 1 in 3 events hides its topic behind a generic category/tag — only its "description" (vector) knows.
  const generic = i % 3 === 0;
  const cat = generic ? "Special Events" : TOPICS[topic]!;
  return {
    id, source: "unc-calendar", sourceEventId: id, sourceOccurrenceId: null, sourceUrl: null, title: `${TOPICS[topic]} ${id}`, description: null,
    startsAt: new Date(now.getTime() + (6 + rnd() * 160) * 3_600_000).toISOString(), endsAt: null, allDay: false, timezone: "America/New_York",
    location: null, organizer: null, hosts: [], imageUrl: null, categories: [cat], tags: generic ? ["event"] : [cat.toLowerCase()], costAmount: null, costText: null,
    eligibility: null, status: "scheduled", sourceStatus: null, lastFetchedAt: now.toISOString(), isDemo: false,
  } as PulseEvent;
}
const centroids = TOPICS.map(() => normalize(Array.from({ length: REC_CONFIG.semanticDims }, () => rnd() - 0.5))!);
const topicOf = new Map<string, number>();
const vectors: Record<string, number[]> = {};
const train: PulseEvent[] = [];
const evalPool: PulseEvent[] = [];
TOPICS.forEach((_, t) => {
  for (let i = 0; i < 12; i++) {
    const id = `${t}-${i}`;
    const e = makeEvent(id, t, i);
    topicOf.set(id, t);
    vectors[id] = normalize(centroids[t]!.map((c) => c + (rnd() - 0.5) * 0.25))!;
    (i < 6 ? train : evalPool).push(e);
  }
});

type Engine = "baseline" | "hybrid";
interface State { swipes: Swipe[]; prefs: UserPreferences }

function rank(engine: Engine, pool: PulseEvent[], s: State, all: PulseEvent[]) {
  return engine === "baseline"
    ? baselineRecommendations({ events: pool, swipes: s.swipes, prefs: s.prefs, filters: F, now })
    : getRecommendations({ events: pool, swipes: s.swipes, prefs: s.prefs, filters: F, now, vectors, history: all });
}

function simulate(engine: Engine, s: State, liked: Set<number>, steps: number): State {
  for (let k = 0; k < steps; k++) {
    const top = rank(engine, train, s, [...train, ...evalPool])[0];
    if (!top) break;
    const like = liked.has(topicOf.get(top.event.id)!);
    const x = top.breakdown?.features ?? banditFeatures(top.event, vectors[top.event.id], now);
    s = {
      swipes: [...s.swipes, { eventId: top.event.id, direction: like ? "like" : "pass", at: now.toISOString() }],
      prefs: { ...applySwipe(s.prefs, top.event, like ? "like" : "pass"), bandit: updateBandit(ensureBandit(s.prefs.bandit), x, like ? 1 : 0) },
    };
  }
  return s;
}

function metrics(engine: Engine, s: State, liked: Set<number>) {
  const top = rank(engine, evalPool, s, [...train, ...evalPool]).slice(0, 10);
  const rel = top.map((r) => (liked.has(topicOf.get(r.event.id)!) ? 1 : 0));
  const dcg = rel.reduce((a, r, i) => a + r / Math.log2(i + 2), 0);
  const nRel = Math.min(10, evalPool.filter((e) => liked.has(topicOf.get(e.id)!)).length);
  const idcg = Array.from({ length: nRel }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  const coverage = new Set(top.map((r) => topicOf.get(r.event.id))).size / TOPICS.length;
  return { ndcg: idcg ? dcg / idcg : 0, coverage };
}

const empty = (): State => ({ swipes: [], prefs: emptyPreferences() });
const A = new Set([0, 1]); // Music + Tech
const B = new Set([3]); // Sports (preference shift)
const rows: Record<string, Record<Engine, { ndcg: number; coverage: number }>> = {};
for (const engine of ["baseline", "hybrid"] as Engine[]) {
  const cold = metrics(engine, empty(), A);
  const s1 = simulate(engine, empty(), A, 10);
  const warm = metrics(engine, s1, A);
  const s2 = simulate(engine, s1, B, 10);
  const shifted = metrics(engine, s2, B);
  for (const [k, v] of Object.entries({ "cold start (0 swipes)": cold, "after 10 swipes (likes Music+Tech)": warm, "after shift (+10 swipes, likes Sports)": shifted })) {
    (rows[k] ??= {} as never)[engine] = v;
  }
}
console.log("Synthetic sanity check — 72 labelled events, 6 topics, 1/3 with generic tags; train/eval pools disjoint.\n");
console.log("scenario".padEnd(42), "NDCG@10 base/hybrid".padEnd(22), "coverage@10 base/hybrid");
for (const [k, v] of Object.entries(rows)) {
  console.log(k.padEnd(42), `${v.baseline.ndcg.toFixed(3)} / ${v.hybrid.ndcg.toFixed(3)}`.padEnd(22), `${v.baseline.coverage.toFixed(2)} / ${v.hybrid.coverage.toFixed(2)}`);
}
