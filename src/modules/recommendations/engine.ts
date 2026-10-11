import type { EventFilters, PulseEvent, RankBreakdown, RankedEvent, Swipe, UserPreferences } from "@/shared/types";
import { benefitLabel, formatLabel, topicLabel } from "@/shared/taxonomy";
import { REC_CONFIG as C } from "./config";

/** Human label for an event label key ("topic:live-music" → "Live music"). */
function labelFor(k: string): string {
  const id = k.slice(k.indexOf(":") + 1);
  if (k.startsWith("topic:")) return topicLabel(id);
  if (k.startsWith("fmt:")) return formatLabel(id);
  if (k.startsWith("ben:")) return benefitLabel(id);
  return id;
}
import { banditFeatures, banditModel } from "./bandit";
import { cosine, eventLabels, fnv, hashedLabelVector, meanVector } from "./vectors";

/**
 * Hybrid recommender:
 *   relevance = w_s·shrink(n)·semanticAffinity + w_r·θᵀx + w_e·min(α·√(xᵀA⁻¹x), cap) + w_t·soonness
 * followed by MMR diversity reranking of the top pool.
 * Semantic affinity uses embeddings when available; otherwise hashed category/tag vectors ("tag-fallback").
 */

export type VectorMap = Record<string, number[]>;

export interface EngineInput {
  events: PulseEvent[];
  swipes: Swipe[];
  prefs: UserPreferences;
  filters: EventFilters;
  now?: Date;
  /** Semantic vectors by event id (from the server embedding service). Missing → fallback. */
  vectors?: VectorMap;
  /** Events already in the plan are excluded from discovery. */
  planIds?: string[];
  /** Keep this event on top (the card under the user's finger). */
  frozenId?: string | null;
  /** Hard filter, injected so ranking.ts keeps owning filter semantics. */
  applyFilters: (events: PulseEvent[], f: EventFilters, now: Date) => PulseEvent[];
  /** All known events (for building profiles from past swipes); defaults to `events`. */
  history?: PulseEvent[];
}

interface Profile {
  semantic: { full: number[] | null; recent: number[] | null; neg: number[] | null; likes: number };
  fallback: { full: number[] | null; recent: number[] | null; neg: number[] | null; likes: number };
  recentLabels: Map<string, number>;
  likes: number;
}

const FB_DIMS = C.semanticDims;
const fallbackVec = (e: PulseEvent) => hashedLabelVector(eventLabels(e), FB_DIMS);

function blend(full: number[] | null, recent: number[] | null): number[] | null {
  if (!full) return recent;
  if (!recent) return full;
  return meanVector([{ v: full, w: 1 - C.recentBlend }, { v: recent, w: C.recentBlend }], full.length);
}

export function buildProfile(swipes: Swipe[], byId: Map<string, PulseEvent>, vectors: VectorMap): Profile {
  // Swipe snapshots let us learn from events that have left the live feed.
  for (const s of swipes) if (s.event && !byId.has(s.eventId)) byId.set(s.eventId, s.event);
  const likes = swipes.filter((s) => s.direction === "like").map((s) => byId.get(s.eventId)).filter((e): e is PulseEvent => !!e);
  const passes = swipes.filter((s) => s.direction === "pass").map((s) => byId.get(s.eventId)).filter((e): e is PulseEvent => !!e);
  const recent = likes.slice(-C.recentLikes);
  const space = (get: (e: PulseEvent) => number[] | null | undefined, dims: number) => {
    const L = likes.map((e) => get(e)).filter((v): v is number[] => !!v);
    const R = recent.map((e) => get(e)).filter((v): v is number[] => !!v);
    const N = passes.map((e) => get(e)).filter((v): v is number[] => !!v);
    const full = meanVector(L.map((v) => ({ v, w: 1 })), dims);
    return { full: blend(full, meanVector(R.map((v) => ({ v, w: 1 })), dims)), recent: meanVector(R.map((v) => ({ v, w: 1 })), dims), neg: meanVector(N.map((v) => ({ v, w: 1 })), dims), likes: L.length };
  };
  const recentLabels = new Map<string, number>();
  for (const e of recent) for (const k of eventLabels(e)) recentLabels.set(k, (recentLabels.get(k) ?? 0) + 1);
  return { semantic: space((e) => vectors[e.id], C.semanticDims), fallback: space(fallbackVec, FB_DIMS), recentLabels, likes: likes.length };
}

function jitter(id: string) {
  return (fnv(id) % 1000) / 1000;
}

/** Series identity: same normalized title = same recurring event / cross-source listing. */
export function seriesKey(e: Pick<PulseEvent, "title">): string {
  return e.title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const DATE_WORDS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b|\b\d+(st|nd|rd|th|am|pm)?\b/g;

/**
 * All identity keys of an event: title (with dates/numbers stripped) and description
 * fingerprint. Two listings sharing any key are treated as the same card.
 */
export function contentKeys(e: Pick<PulseEvent, "title" | "description">): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const keys = [`s:${seriesKey(e)}`];
  const t = norm(e.title).replace(DATE_WORDS, " ").replace(/\s+/g, " ").trim();
  if (t.length >= 4) keys.push(`t:${t}`);
  const d = norm(e.description ?? "").slice(0, 200);
  if (d.length >= 60) keys.push(`d:${d}`);
  return keys;
}

/**
 * One card per series: recurring sessions, cross-source copies and same-content listings
 * collapse to the soonest occurrence, so the deck keeps surfacing new events.
 */
function dedupeOccurrences(events: PulseEvent[], seen: Set<string>): PulseEvent[] {
  const out: PulseEvent[] = [];
  const taken = new Set(seen);
  for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const ks = contentKeys(e);
    if (ks.some((k) => taken.has(k))) continue;
    ks.forEach((k) => taken.add(k));
    out.push(e);
  }
  return out;
}

interface Scored {
  event: PulseEvent;
  rel: number;
  b: RankBreakdown;
  sem: number[] | null;
  fb: number[] | null;
}

function similarity(a: Scored, b: Scored): number {
  return a.sem && b.sem ? cosine(a.sem, b.sem) : cosine(a.fb, b.fb);
}

function reasonsFor(s: Omit<Scored, "b"> & { b: Omit<RankBreakdown, "reasons"> }, p: Profile, hoursAway: number, recentHit: string | null, recentBoost: boolean): string[] {
  const r: string[] = [];
  const W = C.weights;
  if (p.likes > 0 && s.b.semantic >= C.explainSemanticMin) {
    if (recentBoost && recentHit) r.push(`Matches your recent interest in ${recentHit}`);
    else r.push("Similar to events you saved");
  } else if (p.likes > 0 && s.b.predicted >= 0.15 && recentHit) {
    r.push(`Matches your recent interest in ${recentHit}`);
  }
  if (hoursAway <= C.soonHours) r.push("Happening soon");
  return r;
}

export function rankHybrid(input: EngineInput): RankedEvent[] {
  const now = input.now ?? new Date();
  const vectors = input.vectors ?? {};
  const history = input.history ?? input.events;
  const byId = new Map(history.map((e) => [e.id, e]));
  for (const e of input.events) byId.set(e.id, e);
  const swiped = new Set(input.swipes.map((s) => s.eventId));
  const planned = new Set(input.planIds ?? []);
  // Swiping or planning one occurrence hides its other dates and same-content copies too.
  const seenSeries = new Set<string>();
  for (const s of input.swipes) {
    const e = s.event ?? byId.get(s.eventId);
    if (e) contentKeys(e).forEach((k) => seenSeries.add(k));
  }
  for (const id of planned) {
    const e = byId.get(id);
    if (e) contentKeys(e).forEach((k) => seenSeries.add(k));
  }
  const pool = dedupeOccurrences(
    input
      .applyFilters(input.events, input.filters, now)
      .filter((e) => e.status !== "cancelled" && !swiped.has(e.id) && !planned.has(e.id)),
    seenSeries,
  );

  const profile = buildProfile(input.swipes, byId, vectors);
  const model = banditModel(input.prefs.bandit);
  const shrink = profile.likes / (profile.likes + C.shrinkK);
  const W = C.weights;
  // Explicit cold-start prior from onboarding interests. Its share of the total score
  // fades as real swipe history grows (shrink rises with likes).
  const priorInterests = new Set(input.prefs.onboarding?.interests ?? []);
  const priorShare = 1 - shrink;

  const scored: Scored[] = pool.map((event) => {
    const sem = vectors[event.id] ?? null;
    const fb = fallbackVec(event);
    const useSem = !!sem && profile.semantic.likes > 0;
    const space = useSem ? profile.semantic : profile.fallback;
    const v = useSem ? sem : fb;
    const affinityFull = cosine(v, space.full) - C.negativeWeight * cosine(v, space.neg);
    const affinityRecent = cosine(v, space.recent);
    const x = banditFeatures(event, sem, now);
    const unc = model.uncertainty(x);
    const hoursAway = Math.max(0, (new Date(event.startsAt).getTime() - now.getTime()) / 3_600_000);
    const b = {
      mode: (sem ? "semantic" : "tag-fallback") as RankBreakdown["mode"],
      semantic: W.semantic * shrink * affinityFull,
      predicted: W.predicted * Math.max(-1, Math.min(1.5, model.predict(x))),
      exploration: W.exploration * Math.min(C.maxExploration, C.alpha * unc),
      uncertainty: unc,
      time: W.time / (1 + hoursAway / 48),
      diversityPenalty: 0,
      features: x,
    };
    let recentHit: string | null = null;
    let best = 0;
    for (const k of eventLabels(event)) {
      const c = profile.recentLabels.get(k) ?? 0;
      if (c > best) {
        best = c;
        recentHit = labelFor(k);
      }
    }
    const reasons = reasonsFor({ event, rel: 0, sem, fb, b }, profile, hoursAway, recentHit, affinityRecent > cosine(v, space.full) + 0.05);
    const interestHits = (event.topics ?? []).filter((t) => priorInterests.has(t)).length;
    if (interestHits > 0 && profile.likes === 0) reasons.unshift("Matches the interests you picked");
    const rel = b.semantic + b.predicted + b.exploration + b.time + W.interest * priorShare * Math.min(1, interestHits) + W.jitter * jitter(event.id);
    return { event, rel, sem, fb, b: { ...b, reasons } };
  });
  scored.sort((a, b) => b.rel - a.rel);

  // Freeze the visible card.
  const selected: Scored[] = [];
  const fi = input.frozenId ? scored.findIndex((s) => s.event.id === input.frozenId) : -1;
  if (fi >= 0) selected.push(scored.splice(fi, 1)[0]!);

  // MMR over the top pool: argmax λ·rel' − (1−λ)·max sim(selected).
  const candidates = scored.slice(0, C.mmrPool);
  const tail = scored.slice(C.mmrPool);
  if (candidates.length) {
    const lo = Math.min(...candidates.map((c) => c.rel));
    const hi = Math.max(...candidates.map((c) => c.rel));
    const relN = (c: Scored) => (hi - lo < 1e-9 ? 1 : (c.rel - lo) / (hi - lo));
    while (candidates.length) {
      let bi = 0;
      let bv = -Infinity;
      let bp = 0;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]!;
        const sim = selected.length ? Math.max(...selected.slice(-5).map((s) => similarity(c, s))) : 0;
        const val = C.mmrLambda * relN(c) - (1 - C.mmrLambda) * Math.max(0, sim);
        if (val > bv) {
          bv = val;
          bi = i;
          bp = (1 - C.mmrLambda) * Math.max(0, sim);
        }
      }
      const pick = candidates.splice(bi, 1)[0]!;
      pick.b.diversityPenalty = bp;
      selected.push(pick);
    }
  }
  selected.push(...tail);
  applyExploration(selected, input, byId, priorInterests, fi >= 0);

  return selected.map((s) => ({
    event: s.event,
    score: Math.round(s.rel * 1000) / 1000,
    reason: s.b.reasons[0] ?? null,
    breakdown: s.b,
  }));
}

/** Is display slot k (0-based count of cards shown so far) an exploration slot? ~rate of slots. */
export function isExplorationSlot(k: number, rate: number = C.exploration.rate): boolean {
  return Math.floor((k + 1) * rate) > Math.floor(k * rate);
}

/** Per-topic interaction history used to pick underexplored topics and suppress rejected ones. */
export function topicHistory(swipes: Swipe[], byId: Map<string, PulseEvent>) {
  const seen = new Map<string, number>();
  const liked = new Set<string>();
  const explore = new Map<string, { likes: number; passes: number }>();
  const likedLabels = new Set<string>();
  for (const s of swipes) {
    const e = s.event ?? byId.get(s.eventId);
    if (!e) continue;
    if (s.direction === "like") for (const k of eventLabels(e)) if (!k.startsWith("topic:")) likedLabels.add(k);
    for (const t of e.topics ?? []) {
      seen.set(t, (seen.get(t) ?? 0) + 1);
      if (s.direction === "like") liked.add(t);
      if (s.exploratory) {
        const st = explore.get(t) ?? { likes: 0, passes: 0 };
        if (s.direction === "like") st.likes++;
        else st.passes++;
        explore.set(t, st);
      }
    }
  }
  return { seen, liked, explore, likedLabels };
}

/**
 * Exploration slot policy on top of the LinUCB/MMR order. On an exploration slot (never two in a row)
 * the most uncertain candidate with an underexplored topic is moved into that position. Its LinUCB
 * uncertainty bonus is removed from its score so exploration isn't counted twice. Works only on the
 * already-filtered pool, so filters/availability are untouched.
 */
function applyExploration(list: Scored[], input: EngineInput, byId: Map<string, PulseEvent>, priorInterests: Set<string>, frozenOnTop: boolean) {
  const E = C.exploration;
  if (E.rate <= 0 || !list.length) return;
  const h = topicHistory(input.swipes, byId);
  const known = new Set([...h.liked, ...priorInterests]);
  const suppressed = (t: string) => {
    const st = h.explore.get(t);
    return !!st && st.likes === 0 && st.passes >= E.suppressAfterPasses;
  };
  const value = (c: Scored): number | null => {
    const topics = c.event.topics ?? [];
    if (!topics.length || topics.some(suppressed)) return null;
    const fresh = topics.filter((t) => !known.has(t) && (h.seen.get(t) ?? 0) <= E.maxSeenForNew);
    if (!fresh.length) return null;
    const adjacent = eventLabels(c.event).some((k) => !k.startsWith("topic:") && h.likedLabels.has(k));
    const passes = topics.reduce((n, t) => n + (h.explore.get(t)?.passes ?? 0), 0);
    return c.b.uncertainty + (adjacent ? E.adjacentBonus : 0) - E.passPenalty * passes + 0.1 * c.rel;
  };
  const mark = (c: Scored) => {
    c.b.exploratory = true;
    c.rel -= c.b.exploration;
    c.b.exploration = 0;
    c.b.reasons = ["Something new to try", ...c.b.reasons.filter((r) => r === "Happening soon")];
  };
  const n = input.swipes.length;
  let prevExp = !!input.swipes[input.swipes.length - 1]?.exploratory;
  const limit = Math.min(list.length, C.mmrPool);
  for (let j = 0; j < limit; j++) {
    const slot = isExplorationSlot(n + j) && !prevExp;
    if (j === 0 && frozenOnTop) {
      // The visible card keeps its status: it's exploratory iff it would qualify for this slot.
      if (slot && value(list[0]!) !== null) mark(list[0]!);
      prevExp = !!list[0]!.b.exploratory;
      continue;
    }
    if (!slot) {
      prevExp = false;
      continue;
    }
    let bi = -1;
    let bv = -Infinity;
    for (let i = j; i < list.length; i++) {
      const v = value(list[i]!);
      if (v !== null && v > bv) {
        bv = v;
        bi = i;
      }
    }
    if (bi < 0) {
      prevExp = false;
      continue;
    }
    const [pick] = list.splice(bi, 1);
    list.splice(j, 0, pick!);
    mark(pick!);
    prevExp = true;
  }
}
