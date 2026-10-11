import type { PulseEvent, SourceId, SourceRunStatus } from "@/shared/types";

/** Server-only: durable per-source snapshot storage in Lovable Cloud. Never import from client code. */

export interface StoredSnapshot {
  source: SourceId;
  events: PulseEvent[];
  fetchedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  complete: boolean;
  skipped: number;
  status: SourceRunStatus;
  error: string | null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Load all persisted snapshots. Returns null when storage is unavailable (caller keeps in-memory state). */
export async function loadSnapshots(): Promise<StoredSnapshot[] | null> {
  try {
    const db = await admin();
    const { data, error } = await db.from("event_snapshots").select("*");
    if (error) {
      console.error("[snapshots] load failed:", error.message);
      return null;
    }
    return (data ?? []).map((r) => ({
      source: r.source as SourceId,
      events: (r.events as unknown as PulseEvent[]) ?? [],
      fetchedAt: r.fetched_at,
      lastAttemptAt: r.last_attempt_at,
      lastSuccessAt: r.last_success_at,
      complete: r.complete,
      skipped: r.skipped,
      status: r.status as SourceRunStatus,
      error: r.error,
    }));
  } catch (err) {
    console.error("[snapshots] load failed:", (err as Error).message);
    return null;
  }
}

/** Atomically publish one source's snapshot (upsert = full replace of that source's rows). */
export async function saveSnapshot(s: StoredSnapshot): Promise<boolean> {
  try {
    const db = await admin();
    const { error } = await db.from("event_snapshots").upsert({
      source: s.source,
      events: s.events as unknown as Record<string, unknown>[],
      fetched_at: s.fetchedAt,
      last_attempt_at: s.lastAttemptAt,
      last_success_at: s.lastSuccessAt,
      complete: s.complete,
      skipped: s.skipped,
      status: s.status,
      error: s.error,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("[snapshots] save failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[snapshots] save failed:", (err as Error).message);
    return false;
  }
}

/** Record a scheduled slot as started. Returns false when the slot already ran (duplicate delivery). */
export async function claimRefreshSlot(slotKey: string): Promise<boolean> {
  try {
    const db = await admin();
    const { error } = await db.from("refresh_runs").insert({ slot_key: slotKey });
    if (error) return false; // primary-key conflict = already claimed
    return true;
  } catch {
    return false;
  }
}

export async function finishRefreshSlot(slotKey: string, result: unknown): Promise<void> {
  try {
    const db = await admin();
    await db.from("refresh_runs").update({ result: result as Record<string, unknown> }).eq("slot_key", slotKey);
  } catch {
    /* bookkeeping only */
  }
}
