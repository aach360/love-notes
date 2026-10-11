import type { PulseEvent } from "@/shared/types";
import { boundedJson, safeUrl, sleep } from "./http";
import type { SourceAdapter } from "./adapters";

/**
 * Ticketmaster Discovery API v2 — OPTIONAL nearby ticketed events.
 * Without TICKETMASTER_API_KEY it reports "unconfigured" and makes no request.
 * Integration is fixture-tested only until a real key is supplied.
 */
interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  images?: { url?: string; width?: number }[];
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string; dateTBD?: boolean; dateTBA?: boolean; timeTBA?: boolean; noSpecificTime?: boolean };
    end?: { dateTime?: string };
    status?: { code?: string };
  };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  promoter?: { name?: string };
  _embedded?: { venues?: { name?: string; city?: { name?: string } }[] };
}
interface TmPage {
  _embedded?: { events?: TmEvent[] };
  page?: { size?: number; totalElements?: number; totalPages?: number; number?: number };
}

export const TM_DEFAULTS = { postalCode: "27514", radius: "15", unit: "miles" };
const MAX_PAGES = 5; // deep paging is capped at 1,000 results; we stop far sooner

export function mapTicketmaster(json: TmPage, fetchedAt: string): { events: PulseEvent[]; skipped: number } {
  if (!json || typeof json !== "object" || !json.page) throw new Error("ticketmaster: malformed payload (no page metadata)");
  const list = json._embedded?.events ?? []; // absent list + valid page = healthy empty result
  const out: PulseEvent[] = [];
  let skipped = 0;
  for (const e of list) {
    const s = e.dates?.start;
    // Unknown date/time stays unknown: skip rather than invent a midnight.
    if (!e.id || !e.name || !s?.dateTime || s.dateTBD || s.dateTBA || s.timeTBA || s.noSpecificTime) {
      skipped++;
      continue;
    }
    const code = e.dates?.status?.code?.toLowerCase() ?? null;
    const venue = e._embedded?.venues?.[0];
    const price = e.priceRanges?.[0];
    const seg = e.classifications?.[0]?.segment?.name;
    const genre = e.classifications?.[0]?.genre?.name;
    const img = [...(e.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
    out.push({
      id: `ticketmaster:${e.id}`,
      source: "ticketmaster",
      sourceEventId: e.id,
      sourceOccurrenceId: null,
      sourceUrl: safeUrl(e.url),
      title: e.name,
      description: null,
      startsAt: new Date(s.dateTime).toISOString(),
      endsAt: e.dates?.end?.dateTime ? new Date(e.dates.end.dateTime).toISOString() : null,
      allDay: false,
      timezone: "America/New_York",
      location: venue ? [venue.name, venue.city?.name].filter(Boolean).join(", ") || null : null,
      organizer: e.promoter?.name ?? null,
      hosts: [],
      imageUrl: safeUrl(img),
      categories: seg && seg !== "Undefined" ? [seg] : [],
      tags: genre && genre !== "Undefined" ? [genre.toLowerCase(), "ticketed"] : ["ticketed"],
      // Missing price range is NOT free.
      costAmount: price?.min != null && price.min > 0 ? price.min : null,
      costText: price?.min != null ? `${price.currency ?? "USD"} ${price.min}${price.max && price.max !== price.min ? `–${price.max}` : ""}` : null,
      eligibility: null,
      status: code === "cancelled" || code === "canceled" ? "cancelled" : code === "onsale" || code === "offsale" ? "scheduled" : "unknown",
      sourceStatus: code,
      lastFetchedAt: fetchedAt,
      isDemo: false,
    });
  }
  return { events: out, skipped };
}

export function createTicketmasterAdapter(opts: { getKey?: () => string | undefined; fetchPage?: (url: string) => Promise<TmPage> } = {}): SourceAdapter {
  const getKey = opts.getKey ?? (() => process.env["TICKETMASTER_API_KEY"]);
  const fetchPage = opts.fetchPage ?? ((url: string) => boundedJson<TmPage>(url, "ticketmaster")); // label hides the key
  return {
    id: "ticketmaster",
    optional: true,
    async fetch({ now, fetchedAt, windowDays }) {
      const key = getKey();
      if (!key) return { status: "unconfigured", events: [], complete: true, skipped: 0, warnings: [] };
      const end = new Date(now.getTime() + windowDays * 86_400_000);
      const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
      const events: PulseEvent[] = [];
      const warnings: string[] = [];
      let skipped = 0;
      let complete = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const u = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
        u.search = new URLSearchParams({
          apikey: key, ...TM_DEFAULTS, countryCode: "US", size: "100", page: String(page), sort: "date,asc", startDateTime: iso(now), endDateTime: iso(end),
        }).toString();
        const json = await fetchPage(u.toString());
        const r = mapTicketmaster(json, fetchedAt);
        events.push(...r.events);
        skipped += r.skipped;
        const totalPages = json.page?.totalPages ?? 0;
        if (page + 1 >= totalPages) {
          complete = true;
          break;
        }
        await sleep(250); // stays under 5 req/s
      }
      if (!complete) warnings.push(`ticketmaster: stopped at page cap ${MAX_PAGES}; coverage truncated.`);
      return { status: "ok", events, complete, skipped, warnings };
    },
  };
}

export const ticketmasterAdapter = createTicketmasterAdapter();
