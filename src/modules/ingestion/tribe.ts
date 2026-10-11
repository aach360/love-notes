import type { EventSource, PulseEvent, SourceId } from "@/shared/types";
import { nyDateKey, nyMidnightIso, zonedTimeToUtc } from "@/shared/time";
import { boundedJson, safeUrl, sleep } from "./http";
import { cleanTag, type SourceAdapter } from "./adapters";
import { decodeEntities, htmlToText } from "./sanitize";

/** The Events Calendar (WordPress "tribe") REST API: /wp-json/tribe/events/v1/events */

interface TribeVenue { venue?: string; address?: string; city?: string; state?: string }
export interface TribeEvent {
  id?: number | string;
  url?: string;
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  utc_start_date?: string;
  utc_end_date?: string;
  timezone?: string;
  all_day?: boolean;
  image?: { url?: string } | false | null;
  venue?: TribeVenue | TribeVenue[] | false | null;
  categories?: { name?: string }[] | null;
  tags?: { name?: string }[] | null;
  organizer?: { organizer?: string }[] | null;
  cost?: string | null;
  status?: string | null;
}
export interface TribePage { events?: TribeEvent[]; next_rest_url?: string | null; total?: number; total_pages?: number }

export interface TribeConfig {
  id: SourceId & EventSource;
  endpoint: string;
  organizer: string;
}

const RX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

/** Tribe's utc_* fields have no "Z" — parse explicitly as UTC. */
export function parseTribeUtc(s: string | undefined): string | null {
  const m = s ? RX.exec(s.trim()) : null;
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, se!)).toISOString();
}
function parseLocal(s: string | undefined, tz: string): string | null {
  const m = s ? RX.exec(s.trim()) : null;
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return zonedTimeToUtc(y!, mo!, d!, h!, mi!, se!, tz).toISOString();
}
const addDay = (key: string) => {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Price text only counts as free when it says so plainly; "" = unknown. */
function costOf(cost: string | null | undefined): { amount: number | null; text: string | null } {
  const text = cost ? decodeEntities(cost).trim() : "";
  if (!text) return { amount: null, text: null };
  if (/^free$/i.test(text)) return { amount: 0, text };
  const only = /^\$?\s*(\d+(?:\.\d{1,2})?)$/.exec(text);
  return { amount: only ? Number(only[1]) : null, text };
}

export function mapTribeEvent(e: TribeEvent, cfg: TribeConfig, fetchedAt: string): PulseEvent | null {
  const title = e.title ? decodeEntities(e.title).trim() : "";
  if (e.id == null || !title) return null;
  const tz = e.timezone || "America/New_York";
  const allDay = e.all_day === true;
  let startsAt: string | null;
  let endsAt: string | null;
  if (allDay) {
    const sk = e.start_date?.slice(0, 10);
    const ek = e.end_date?.slice(0, 10) ?? sk;
    if (!sk || !/^\d{4}-\d{2}-\d{2}$/.test(sk)) return null;
    startsAt = nyMidnightIso(sk);
    endsAt = ek && /^\d{4}-\d{2}-\d{2}$/.test(ek) ? nyMidnightIso(addDay(ek)) : null;
  } else {
    startsAt = parseTribeUtc(e.utc_start_date) ?? parseLocal(e.start_date, tz);
    endsAt = parseTribeUtc(e.utc_end_date) ?? parseLocal(e.end_date, tz);
  }
  if (!startsAt) return null;
  if (endsAt && endsAt < startsAt) endsAt = null;
  const v = Array.isArray(e.venue) ? e.venue[0] : e.venue || null;
  const location = v ? [v.venue, v.address, v.city].filter(Boolean).map((s) => decodeEntities(String(s))).join(", ") || null : null;
  const cost = costOf(e.cost);
  const cancelled = /^\s*(cancel+ed|postponed)\b/i.test(title);
  return {
    id: `${cfg.id}:${e.id}`,
    source: cfg.id,
    sourceEventId: String(e.id),
    sourceOccurrenceId: null,
    sourceUrl: safeUrl(e.url),
    title,
    description: htmlToText(e.description),
    startsAt,
    endsAt,
    allDay,
    timezone: "America/New_York",
    location,
    organizer: e.organizer?.[0]?.organizer ? decodeEntities(e.organizer[0].organizer) : cfg.organizer,
    hosts: [],
    imageUrl: e.image && typeof e.image === "object" ? safeUrl(e.image.url) : null,
    categories: (e.categories ?? []).map((c) => (c.name ? decodeEntities(c.name) : "")).filter(Boolean),
    tags: (e.tags ?? []).map((t) => cleanTag(t.name ?? "")).filter(Boolean),
    costAmount: cost.amount,
    costText: cost.text,
    eligibility: null,
    // "publish" is publication state, not attendance — only an explicit title marker cancels.
    status: cancelled ? "cancelled" : "unknown",
    sourceStatus: e.status ?? null,
    lastFetchedAt: fetchedAt,
    isDemo: false,
  };
}

export const TRIBE_MAX_PAGES = 6;
export const TRIBE_PER_PAGE = 50;

export function tribeAdapter(cfg: TribeConfig): SourceAdapter {
  const base = new URL(cfg.endpoint);
  return {
    id: cfg.id,
    optional: false,
    async fetch({ now, fetchedAt, windowDays }) {
      const start = nyDateKey(now);
      let end = start;
      for (let i = 0; i < windowDays; i++) end = addDay(end);
      const first = new URL(base);
      first.search = new URLSearchParams({ per_page: String(TRIBE_PER_PAGE), start_date: start, end_date: end, page: "1" }).toString();
      const events: PulseEvent[] = [];
      let skipped = 0;
      let complete = false;
      let url: string | null = first.toString();
      for (let page = 1; url && page <= TRIBE_MAX_PAGES; page++) {
        const json: TribePage = await boundedJson<TribePage>(url, `${cfg.id} events API`);
        if (!Array.isArray(json.events)) throw new Error(`${cfg.id}: unexpected response shape`);
        for (const e of json.events) {
          const m = mapTribeEvent(e, cfg, fetchedAt);
          if (m) events.push(m);
          else skipped++;
        }
        const next = json.next_rest_url ? new URL(json.next_rest_url) : null;
        if (!next) {
          complete = true;
          break;
        }
        // Only follow pagination that stays on the configured host + API path.
        if (next.protocol !== "https:" || next.host !== base.host || next.pathname.replace(/\/$/, "") !== base.pathname.replace(/\/$/, "")) throw new Error(`${cfg.id}: unexpected pagination link`);
        url = next.toString();
        await sleep(500);
      }
      const warnings = complete ? [] : [`${cfg.id}: stopped after ${TRIBE_MAX_PAGES} pages; some events may be missing.`];
      return { status: "ok", events, complete, skipped, warnings };
    },
  };
}

export const acklandAdapter = tribeAdapter({ id: "ackland", endpoint: "https://events.ackland.org/wp-json/tribe/events/v1/events", organizer: "Ackland Art Museum" });
export const moreheadAdapter = tribeAdapter({ id: "morehead", endpoint: "https://moreheadplanetarium.org/wp-json/tribe/events/v1/events", organizer: "Morehead Planetarium and Science Center" });
