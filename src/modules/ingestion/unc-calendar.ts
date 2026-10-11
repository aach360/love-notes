import type { PulseEvent } from "@/shared/types";
import { addDayKeys, nyDateKey, nyMidnightIso } from "@/shared/time";
import { boundedJson, safeUrl, sleep } from "./http";
import { cleanTag, type SourceAdapter } from "./adapters";
import { decodeEntities, htmlToText } from "./sanitize";

/** UNC University Calendar (Localist API v2). Docs: https://developer.localist.com/doc/api */

interface LocalistInstance {
  event_instance?: { id?: number | string; start?: string; end?: string | null; all_day?: boolean };
}
interface LocalistFilterItem {
  name?: string;
}
interface LocalistEvent {
  id?: number | string;
  title?: string;
  localist_url?: string;
  location_name?: string | null;
  location?: string | null;
  status?: string | null;
  free?: boolean | null;
  ticket_cost?: string | null;
  photo_url?: string | null;
  tags?: string[] | null;
  filters?: Record<string, LocalistFilterItem[] | undefined> | null;
  departments?: { name?: string }[] | null;
  description_text?: string | null;
  description?: string | null;
  event_instances?: LocalistInstance[] | null;
}
interface LocalistPage {
  events?: { event?: LocalistEvent }[];
  page?: { current?: number; total?: number; total_items?: number; next_page?: number | null };
}

const BASE = "https://calendar.unc.edu/api/2/events";
export const UNC_MAX_PAGES = 10;
/** Source publishes a 1 s crawl delay; keep ≥1.1 s between request starts. */
export const UNC_DELAY_MS = 1100;

export function mapLocalistPage(json: LocalistPage, fetchedAt: string): { events: PulseEvent[]; skipped: number } {
  if (!Array.isArray(json.events)) throw new Error("unc-calendar: malformed payload (no events[])");
  const out: PulseEvent[] = [];
  let skipped = 0;
  for (const wrap of json.events) {
    const e = wrap.event;
    if (!e?.id || !e.title || !Array.isArray(e.event_instances)) {
      skipped++;
      continue;
    }
    const names = (k: string) => (e.filters?.[k] ?? []).map((f) => f.name?.trim()).filter((n): n is string => !!n);
    const types = names("event_types");
    const topics = names("event_topic");
    const audience = names("event_target_audience");
    const dept = e.departments?.map((d) => d.name?.trim()).filter((n): n is string => !!n) ?? [];
    const rawStatus = e.status?.toLowerCase() ?? null;
    for (const w of e.event_instances) {
      const inst = w.event_instance;
      if (!inst?.id || !inst.start || Number.isNaN(Date.parse(inst.start))) {
        skipped++;
        continue;
      }
      const allDay = inst.all_day === true;
      let startsAt: string;
      let endsAt: string | null;
      if (allDay) {
        // Date-only: keep the calendar date, represent as NY midnight → next NY midnight (exclusive).
        const startKey = inst.start.slice(0, 10);
        const endKey = inst.end && !Number.isNaN(Date.parse(inst.end)) ? nyDateKey(inst.end) : startKey;
        startsAt = nyMidnightIso(startKey);
        endsAt = nyMidnightIso(addDayKeys(endKey < startKey ? startKey : endKey, 1));
      } else {
        startsAt = new Date(inst.start).toISOString();
        endsAt = inst.end && !Number.isNaN(Date.parse(inst.end)) ? new Date(inst.end).toISOString() : null;
      }
      out.push({
        id: `unc-calendar:${e.id}:${inst.id}`,
        source: "unc-calendar",
        sourceEventId: String(e.id),
        sourceOccurrenceId: String(inst.id),
        sourceUrl: safeUrl(e.localist_url),
        title: decodeEntities(e.title).trim(),
        description: e.description_text?.trim() || htmlToText(e.description),
        startsAt,
        endsAt,
        allDay,
        timezone: "America/New_York",
        location: e.location_name?.trim() || e.location?.trim() || null,
        organizer: dept[0] ?? null,
        hosts: dept,
        imageUrl: safeUrl(e.photo_url),
        categories: types.length ? [types[0]!] : [],
        tags: Array.from(new Set([...topics, ...types.slice(1), ...(e.tags ?? [])].map(cleanTag).filter(Boolean))),
        // Only `free === true` is evidence. `false` alone does not prove paid admission.
        costAmount: e.free === true ? 0 : null,
        costText: e.ticket_cost?.trim() || null,
        eligibility: audience.length ? `Audience: ${audience.join(", ")}` : null,
        status: rawStatus === "cancelled" || rawStatus === "canceled" ? "cancelled" : rawStatus === "live" ? "scheduled" : "unknown",
        sourceStatus: rawStatus,
        lastFetchedAt: fetchedAt,
        isDemo: false,
      });
    }
  }
  return { events: out, skipped };
}

export function localistUrl(startKey: string, days: number, page: number) {
  const u = new URL(BASE);
  u.search = new URLSearchParams({ start: startKey, days: String(days), pp: "100", page: String(page), distinct: "false", sort: "date", direction: "asc" }).toString();
  return u.toString();
}

export function createUncCalendarAdapter(opts: { fetchPage?: (url: string) => Promise<LocalistPage>; delayMs?: number; maxPages?: number } = {}): SourceAdapter {
  const fetchPage = opts.fetchPage ?? ((url: string) => boundedJson<LocalistPage>(url, "unc-calendar"));
  const delay = opts.delayMs ?? UNC_DELAY_MS;
  const maxPages = opts.maxPages ?? UNC_MAX_PAGES;
  return {
    id: "unc-calendar",
    optional: false,
    async fetch({ now, fetchedAt, windowDays }) {
      // Note: a start-date query can miss multi-day events that began before today.
      const start = nyDateKey(now);
      const events: PulseEvent[] = [];
      const warnings: string[] = [];
      let skipped = 0;
      let page = 1;
      let complete = false;
      for (;;) {
        const t0 = Date.now();
        const json = await fetchPage(localistUrl(start, windowDays, page)); // failure on any page throws → no half snapshot
        const r = mapLocalistPage(json, fetchedAt);
        events.push(...r.events);
        skipped += r.skipped;
        const total = json.page?.total ?? page;
        if (!json.page?.next_page || page >= total) {
          complete = true;
          break;
        }
        if (page >= maxPages) {
          warnings.push(`unc-calendar: stopped at page cap ${maxPages} of ${total}; coverage truncated.`);
          break;
        }
        page++;
        const wait = delay - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
      }
      return { status: "ok", events, complete, skipped, warnings };
    },
  };
}

export const uncCalendarAdapter = createUncCalendarAdapter();
