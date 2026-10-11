import type { PulseEvent } from "@/shared/types";
import { cleanTag } from "./adapters";
import type { EnrichResult } from "./gemini";

/**
 * AI enrichment cache. Keyed by event id + a hash of the content sent to the model,
 * so unchanged events are never re-billed. IN-MEMORY ONLY: it does not survive a
 * server restart or a new edge instance — enrichment is re-run on the next admin refresh.
 */
export const ENRICH_MAX_PER_RUN = 12;
export const ENRICH_CONCURRENCY = 2;
export const ENRICH_DEADLINE_MS = 25_000;

interface Entry { hash: string; summary: string; tags: string[] }
export type EnrichFn = (input: { title: string; description: string | null }) => Promise<EnrichResult>;

export function contentHash(e: Pick<PulseEvent, "title" | "description">): string {
  const s = `${e.title}\u0000${e.description ?? ""}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

export interface EnrichStats { status: "ok" | "unconfigured" | "error"; attempted: number; enriched: number; cached: number; failed: number; error: string | null }

export function createEnrichmentCache() {
  const cache = new Map<string, Entry>();
  /** Rotating cursor so bounded runs eventually cover every event, not just the first batch. */
  let cursor = 0;

  /** Merge cached AI fields. Never touches source fields; AI tags already in source tags are dropped. */
  function apply(events: PulseEvent[]): PulseEvent[] {
    return events.map((e) => {
      const c = cache.get(e.id);
      if (!c || c.hash !== contentHash(e)) return e;
      const source = new Set(e.tags.map(cleanTag));
      return { ...e, aiSummary: c.summary, aiTags: c.tags.filter((t) => !source.has(t)) };
    });
  }

  async function run(events: PulseEvent[], enrich: EnrichFn, opts: { max?: number; concurrency?: number; deadlineMs?: number } = {}): Promise<EnrichStats> {
    const real = events.filter((e) => !e.isDemo && e.status !== "cancelled");
    const cached = real.filter((e) => cache.get(e.id)?.hash === contentHash(e)).length;
    const missing = real.filter((e) => cache.get(e.id)?.hash !== contentHash(e));
    // Rotate the starting point each run: with a bounded batch size, always taking the
    // first N would starve everything after position N forever.
    const start = missing.length ? cursor % missing.length : 0;
    const rotated = [...missing.slice(start), ...missing.slice(0, start)];
    const todo = rotated.slice(0, opts.max ?? ENRICH_MAX_PER_RUN);
    cursor = start + todo.length;
    const deadline = Date.now() + (opts.deadlineMs ?? ENRICH_DEADLINE_MS);
    const stats: EnrichStats = { status: "ok", attempted: 0, enriched: 0, cached, failed: 0, error: null };
    let i = 0;
    let stop = false;
    const worker = async () => {
      while (!stop && i < todo.length && Date.now() < deadline) {
        const e = todo[i++]!;
        stats.attempted++;
        const r = await enrich({ title: e.title, description: e.description });
        if (r.status === "unconfigured") {
          stats.status = "unconfigured";
          stop = true;
          return;
        }
        if (r.status === "error") {
          stats.failed++;
          stats.error = r.message.slice(0, 200);
          // Credits/permission problems are terminal for this run.
          if (/HTTP (401|402|403|429)/.test(r.message)) stop = true;
          continue;
        }
        const tags = [...new Set(r.data.tags.map(cleanTag).filter((t) => t.length > 0 && t.length <= 40))].slice(0, 8);
        const summary = r.data.summary.trim();
        if (!summary) {
          stats.failed++;
          continue;
        }
        cache.set(e.id, { hash: contentHash(e), summary, tags });
        stats.enriched++;
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency ?? ENRICH_CONCURRENCY }, worker));
    if (stats.status === "ok" && stats.failed && !stats.enriched) stats.status = "error";
    return stats;
  }

  return { apply, run, size: () => cache.size, clear: () => cache.clear() };
}
