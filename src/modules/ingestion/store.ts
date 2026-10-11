import type { PulseEvent } from "@/shared/types";
import { hasEnded } from "@/shared/time";

/**
 * Dedupe key = canonical source + occurrence identity, i.e. the event `id`
 * (Heel Life JSON and RSS share "heellife:<id>"; Localist keeps one row per instance).
 */
export function dedupeKey(e: Pick<PulseEvent, "id">): string {
  return e.id;
}

/**
 * Event repository. Default implementation is in-memory (per server instance).
 * Swap for a database-backed version (see supabase/schema.sql) without changing callers.
 */
export interface EventRepository {
  upsertMany(events: PulseEvent[]): { inserted: number; updated: number };
  /** Rechecks expiry at read time; drops cancelled. */
  listUpcoming(now?: Date): PulseEvent[];
  clear(): void;
}

export function createMemoryRepository(): EventRepository {
  const map = new Map<string, PulseEvent>();
  return {
    upsertMany(events) {
      let inserted = 0;
      let updated = 0;
      for (const e of events) {
        const key = dedupeKey(e);
        const prev = map.get(key);
        if (prev) {
          updated++;
          map.set(key, { ...e, aiSummary: e.aiSummary ?? prev.aiSummary ?? null, aiTags: e.aiTags ?? prev.aiTags ?? [] });
        } else {
          inserted++;
          map.set(key, e);
        }
      }
      return { inserted, updated };
    },
    listUpcoming(now = new Date()) {
      return [...map.values()]
        .filter((e) => !hasEnded(e, now) && e.status !== "cancelled")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    clear() {
      map.clear();
    },
  };
}
