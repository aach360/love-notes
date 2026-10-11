import type { EventFeed, PulseEvent, SourceId, SourceStatus } from "@/shared/types";
import { buildDemoEvents } from "@/fixtures/demo-events";
import { isEligibleForDiscover } from "@/shared/time";
import { heelLifeAdapter, type SourceAdapter } from "./adapters";
import { uncCalendarAdapter } from "./unc-calendar";
import { carrboroAdapter } from "./carrboro";
import { ticketmasterAdapter } from "./ticketmaster";
import { acklandAdapter, moreheadAdapter } from "./tribe";
import { orangeCountyAdapter, uncLibrariesAdapter } from "./ics-feeds";
import { dedupeKey } from "./store";
import { createEnrichmentCache } from "./enrichment";
import { withClassification } from "@/modules/recommendations/classify";
import { TAXONOMY_VERSION } from "@/shared/taxonomy";
import { loadSnapshots, saveSnapshot } from "./snapshot-store";

/** Source registry. All run independently; one failing never erases the others. */
export const ADAPTERS: SourceAdapter[] = [heelLifeAdapter, uncCalendarAdapter, carrboroAdapter, acklandAdapter, moreheadAdapter, uncLibrariesAdapter, orangeCountyAdapter, ticketmasterAdapter];

/**
 * Upstream ingestion runs ONLY on the twice-weekly schedule (or a privileged manual
 * refresh) — never on ordinary Discover reads. The 15-minute figure is now purely an
 * app-side response cache TTL for reads of persisted snapshots.
 */
export const RESPONSE_CACHE_TTL_MS = 15 * 60 * 1000;
/** Snapshots older than this are excluded from Discover until the source refreshes. */
export const SNAPSHOT_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
/** Fetch horizon: today through the next 60 days (upper boundary exclusive). */
export const WINDOW_DAYS = 60;

interface Snapshot {
  events: PulseEvent[];
  fetchedAt: string;
  complete: boolean;
  skipped: number;
}

interface SourceState {
  good: Snapshot | null;
  lastStatus: SourceStatus["status"] | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  warnings: string[];
}

export interface Importer {
  getFeed(now?: Date): Promise<EventFeed>;
  refresh(force: boolean, now?: Date): Promise<void>;
}

export function createImporter(adapters: SourceAdapter[] = ADAPTERS, opts: { windowDays?: number; persist?: boolean } = {}): Importer {
  const states = new Map<SourceId, SourceState>(adapters.map((a) => [a.id, { good: null, lastStatus: null, lastError: null, lastAttemptAt: null, lastSuccessAt: null, warnings: [] }]));
  const persist = opts.persist ?? true;
  let loaded = false;
  let inFlight: Promise<void> | null = null;

  /** One-time bootstrap from durable storage. Never fetches publishers. */
  async function load() {
    if (loaded || !persist) return;
    loaded = true;
    const rows = await loadSnapshots();
    if (!rows) return;
    for (const r of rows) {
      const st = states.get(r.source);
      if (!st) continue;
      st.lastStatus = r.status;
      st.lastError = r.error;
      st.lastAttemptAt = r.lastAttemptAt;
      st.lastSuccessAt = r.lastSuccessAt;
      if (r.fetchedAt && r.status === "ok") {
        st.good = { events: r.events, fetchedAt: r.fetchedAt, complete: r.complete, skipped: r.skipped };
      }
    }
  }

  async function runOne(a: SourceAdapter, now: Date) {
    const st = states.get(a.id)!;
    const fetchedAt = now.toISOString();
    st.lastAttemptAt = fetchedAt;
    try {
      const r = await a.fetch({ now, fetchedAt, windowDays: opts.windowDays ?? WINDOW_DAYS });
      st.lastStatus = r.status;
      st.lastError = null;
      st.warnings = r.warnings;
      if (r.status === "ok") {
        // Dedupe within the source by canonical occurrence identity.
        const byId = new Map<string, PulseEvent>();
        for (const e of r.events) byId.set(dedupeKey(e), e);
        // Publish only after the source refresh completes; a failed later page
        // (complete=false) still replaced atomically as one snapshot, never per-page.
        st.good = { events: [...byId.values()], fetchedAt, complete: r.complete, skipped: r.skipped };
        st.lastSuccessAt = fetchedAt;
      }
      // On failure keep the last complete snapshot (st.good untouched).
    } catch (err) {
      st.lastStatus = "error";
      st.lastError = (err as Error).message.slice(0, 200);
      st.warnings = [];
      console.error(`[ingestion] ${a.id} failed:`, st.lastError);
    }
    if (persist) {
      await saveSnapshot({
        source: a.id,
        events: st.good?.events ?? [],
        fetchedAt: st.good?.fetchedAt ?? null,
        lastAttemptAt: st.lastAttemptAt,
        lastSuccessAt: st.lastSuccessAt,
        complete: st.good?.complete ?? false,
        skipped: st.good?.skipped ?? 0,
        status: st.lastStatus ?? "error",
        error: st.lastError,
      });
    }
  }

  function refresh(force: boolean, now = new Date()): Promise<void> {
    // Ordinary reads never trigger upstream fetches; only force (scheduled/manual) does.
    if (!force) return load();
    if (inFlight) return inFlight; // coalesce concurrent refreshes
    inFlight = Promise.all(adapters.map((a) => runOne(a, now)))
      .then(() => undefined)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function getFeed(now = new Date()): Promise<EventFeed> {
    await refresh(false, now);
    const sources: SourceStatus[] = [];
    const events = new Map<string, PulseEvent>();
    const cancelled = new Set<string>();
    const warnings: string[] = [];
    let anyUsable = false;

    for (const a of adapters) {
      const st = states.get(a.id)!;
      const snap = st.good;
      const failed = st.lastStatus === "error";
      const age = snap ? now.getTime() - Date.parse(snap.fetchedAt) : Infinity;
      const tooOld = age >= SNAPSHOT_MAX_AGE_MS;
      const usable = !!snap && !tooOld;
      let count = 0;
      if (usable && snap) {
        anyUsable = true;
        for (const e of snap.events) {
          if (e.status === "cancelled") {
            cancelled.add(e.id);
            continue;
          }
          if (!isEligibleForDiscover(e, now)) continue; // eligibility rechecked at serve time
          events.set(e.id, e);
          count++;
        }
      }
      sources.push({
        source: a.id,
        status: st.lastStatus ?? "error",
        fetchedAt: usable && snap ? snap.fetchedAt : null,
        eventCount: count,
        complete: usable && snap ? snap.complete : false,
        stale: failed && usable,
        skipped: snap?.skipped ?? 0,
        error: tooOld && snap ? `Snapshot older than 8 days; excluded until the next refresh.` : st.lastError,
      });
      warnings.push(...st.warnings);
      if (tooOld && snap) warnings.push(`${a.id}: listings are over 8 days old and hidden until the next refresh.`);
      else if (failed) warnings.push(usable ? `${a.id}: latest refresh failed; showing data from ${snap!.fetchedAt}.` : `${a.id}: unavailable.`);
    }

    if (anyUsable) {
      const list = [...events.values()].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
      const freshest = [...states.values()].map((s) => s.good?.fetchedAt).filter(Boolean).sort().pop()!;
      return { events: list, origin: "live", fetchedAt: freshest, warnings, sources, cancelledIds: [...cancelled] };
    }
    return {
      events: buildDemoEvents(),
      origin: "demo",
      fetchedAt: now.toISOString(),
      warnings: [...warnings, "Showing demo events — every live source failed."],
      sources,
      cancelledIds: [],
    };
  }

  return { getFeed, refresh };
}

const shared = createImporter();
/** In-memory AI enrichment cache (lost on restart; see enrichment.ts). */
const enrichment = createEnrichmentCache();

/** Cached read used by the app. Reads persisted snapshots only — never fetches publishers. */
export async function getFeed(): Promise<EventFeed> {
  const f = await shared.getFeed();
  if (f.origin !== "live") return f;
  // Deterministic taxonomy classification runs on every serve (cheap, no model);
  // stale classifications (old taxonomy version) are recomputed automatically.
  const classified = f.events.map((e) => (e.taxonomyVersion === TAXONOMY_VERSION ? e : withClassification(e)));
  return { ...f, events: enrichment.apply(classified) };
}

/** Privileged: callers must authorize first. Fetches publishers and publishes snapshots. */
export async function forceImport() {
  await shared.refresh(true);
  const f = await shared.getFeed();
  // Bounded enrichment inside the request (no detached background work).
  const { enrichWithGemini } = await import("./gemini");
  const ai = f.origin === "live" ? await enrichment.run(f.events, enrichWithGemini) : null;
  return { origin: f.origin, fetchedAt: f.fetchedAt, warnings: f.warnings, total: f.events.length, sources: f.sources, ai };
}
