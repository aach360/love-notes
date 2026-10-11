import type { PulseEvent, SourceId } from "@/shared/types";
import { htmlToText, decodeEntities } from "./sanitize";
import { boundedJson, boundedText, safeUrl, sleep } from "./http";

/**
 * Source adapter contract. Each adapter is isolated, validates its own payload and
 * returns normalized events (unknown facts = null). Throw on failure — a thrown
 * adapter is reported as "error", distinct from a healthy empty result.
 */
export interface AdapterContext {
  now: Date;
  fetchedAt: string;
  /** Discovery window length in days, starting today (America/New_York). */
  windowDays: number;
}

export interface AdapterResult {
  status: "ok" | "unconfigured";
  /** Includes explicitly cancelled records (status "cancelled"); the importer filters them. */
  events: PulseEvent[];
  complete: boolean;
  skipped: number;
  warnings: string[];
}

export interface SourceAdapter {
  id: SourceId;
  /** Optional sources never trigger demo mode when unconfigured. */
  optional: boolean;
  fetch(ctx: AdapterContext): Promise<AdapterResult>;
}

const THEME_LABELS: Record<string, string> = {
  Arts: "Arts",
  Athletics: "Athletics",
  CommunityService: "Service",
  Cultural: "Cultural",
  Fundraising: "Fundraising",
  GroupBusiness: "Org Business",
  Social: "Social",
  Spirituality: "Spirituality",
  ThoughtfulLearning: "Learning",
};

export const themeToCategory = (t: string | null | undefined) => (t ? (THEME_LABELS[t] ?? t) : null);

export function cleanTag(s: string) {
  return decodeEntities(s).replace(/\s+/g, " ").trim().toLowerCase();
}

/* ---------------- Heel Life JSON (undocumented website endpoint) ----------------
 * Not a published contract: isolated here behind HeelLifeTransport so it can be swapped
 * for official Engage API credentials later. Inspected response: { "@odata.count", value: [...] }.
 */

export interface HeelLifeJsonEvent {
  id: string | number;
  name: string;
  description?: string | null;
  location?: string | null;
  startsOn: string;
  endsOn?: string | null;
  imagePath?: string | null;
  organizationName?: string | null;
  organizationNames?: string[] | null;
  theme?: string | null;
  categoryNames?: string[] | null;
  benefitNames?: string[] | null;
  status?: string | null;
  visibility?: string | null;
}

export function mapHeelLifeJson(e: HeelLifeJsonEvent, fetchedAt: string): PulseEvent | null {
  const id = String(e.id ?? "").trim();
  const startsAt = parseDate(e.startsOn);
  if (!/^\d+$/.test(id) || !e.name || !startsAt) return null;
  const cat = themeToCategory(e.theme === "Unknown" ? null : e.theme);
  const tags = [...(e.categoryNames ?? []), ...(e.benefitNames ?? [])].map(cleanTag).filter(Boolean);
  const hosts = [e.organizationName, ...(e.organizationNames ?? [])].map((h) => (h ? decodeEntities(h).trim() : "")).filter(Boolean);
  const raw = (e.status ?? "").toLowerCase() || null;
  return {
    id: `heellife:${id}`,
    source: "heellife-json",
    sourceEventId: id,
    sourceOccurrenceId: null,
    sourceUrl: `https://heellife.unc.edu/event/${id}`,
    title: decodeEntities(e.name).trim(),
    description: htmlToText(e.description),
    startsAt,
    endsAt: parseDate(e.endsOn ?? undefined),
    allDay: false,
    timezone: "America/New_York",
    location: e.location?.trim() ? decodeEntities(e.location.trim()) : null,
    organizer: hosts[0] ?? null,
    hosts: Array.from(new Set(hosts)),
    imageUrl: e.imagePath ? safeUrl(`https://se-images.campuslabs.com/clink/images/${encodeURIComponent(e.imagePath)}?preset=med-w`) : null,
    categories: cat ? [cat] : [],
    tags: Array.from(new Set(tags)),
    costAmount: null,
    costText: null,
    eligibility: null,
    status: raw === "cancelled" || raw === "canceled" ? "cancelled" : raw === "approved" ? "scheduled" : "unknown",
    sourceStatus: raw,
    lastFetchedAt: fetchedAt,
    isDemo: false,
  };
}

export const HEELLIFE_JSON_PAGE = 50;
export const HEELLIFE_JSON_MAX_PAGES = 8;

/** Conservative pagination: sequential pages, small page size, hard page cap, polite delay. */
export async function fetchHeelLifeJson(ctx: AdapterContext, get: typeof boundedJson = boundedJson) {
  const out: PulseEvent[] = [];
  let skipped = 0;
  let complete = false;
  const endsAfter = ctx.now.toISOString().slice(0, 19);
  for (let page = 0; page < HEELLIFE_JSON_MAX_PAGES; page++) {
    const q = new URLSearchParams({ take: String(HEELLIFE_JSON_PAGE), skip: String(page * HEELLIFE_JSON_PAGE), orderByField: "endsOn", orderByDirection: "ascending", status: "Approved", endsAfter });
    const body = await get<{ value?: unknown; "@odata.count"?: number }>(`https://heellife.unc.edu/api/discovery/event/search?${q}`, "heellife JSON");
    if (!body || !Array.isArray(body.value)) throw new Error("heellife JSON: unexpected response shape (no value array)");
    for (const raw of body.value as HeelLifeJsonEvent[]) {
      if (raw?.visibility && raw.visibility !== "Public") { skipped++; continue; }
      const e = mapHeelLifeJson(raw, ctx.fetchedAt);
      if (e) out.push(e); else skipped++;
    }
    const total = typeof body["@odata.count"] === "number" ? body["@odata.count"] : null;
    if (body.value.length < HEELLIFE_JSON_PAGE || (total !== null && (page + 1) * HEELLIFE_JSON_PAGE >= total)) { complete = true; break; }
    await sleep(250);
  }
  return { events: out, skipped, complete };
}

/* ---------------- Heel Life RSS (default transport) ---------------- */

function stripCdata(s: string) {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
}

/** Prefixes bound to namespace URI "events" anywhere in the document. */
function eventsPrefixes(xml: string): string[] {
  return Array.from(xml.matchAll(/xmlns:([\w-]+)\s*=\s*"events"/g), (m) => m[1]!);
}

/** Elements with local name `name` in namespace URI "events" (default-ns attr or bound prefix). */
function nsAll(block: string, name: string, prefixes: string[]): string[] {
  const re = new RegExp(`<((?:[\\w-]+:)?${name})(\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "g");
  const out: string[] = [];
  for (const m of block.matchAll(re)) {
    const qname = m[1]!;
    const attrs = m[2] ?? "";
    const prefix = qname.includes(":") ? qname.split(":")[0]! : null;
    const inNs = prefix ? prefixes.includes(prefix) : /xmlns\s*=\s*"events"/.test(attrs);
    if (inNs) out.push(stripCdata(m[3] ?? ""));
  }
  return out;
}

/** Plain (no-namespace) RSS child elements. */
function plainAll(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s(?![^>]*xmlns\\s*=)[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  return Array.from(block.matchAll(re), (m) => stripCdata(m[1] ?? ""));
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseHeelLifeRss(xml: string, fetchedAt: string): { events: PulseEvent[]; skipped: number } {
  if (!/<rss[\s>]/.test(xml) || !/<channel[\s>]/.test(xml)) throw new Error("heellife: not an RSS document");
  const prefixes = eventsPrefixes(xml);
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: PulseEvent[] = [];
  let skipped = 0;
  for (const item of items) {
    const link = plainAll(item, "link")[0] ?? null;
    const id = link?.match(/\/event\/(\d+)/)?.[1];
    const title = plainAll(item, "title")[0];
    // Event times come from the "events" namespace — never pubDate.
    const startsAt = parseDate(nsAll(item, "start", prefixes)[0]);
    if (!id || !title || !startsAt) {
      skipped++;
      continue;
    }
    const endsAt = parseDate(nsAll(item, "end", prefixes)[0]);
    const descHtml = plainAll(item, "description")[0] ?? "";
    const inner = descHtml.match(/class="p-description description">([\s\S]*?)<\/div>\s*<div>/)?.[1] ?? null;
    const cats = plainAll(item, "category").map((c) => decodeEntities(c).trim()).filter(Boolean);
    const theme = cats[0] ?? null;
    const hosts = nsAll(item, "host", prefixes).map((h) => decodeEntities(h).trim()).filter(Boolean);
    const rawStatus = (nsAll(item, "status", prefixes)[0] ?? "").trim().toLowerCase() || null;
    const loc = nsAll(item, "location", prefixes)[0];
    const image = item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] ?? null;
    out.push({
      id: `heellife:${id}`,
      source: "heellife-rss",
      sourceEventId: id,
      sourceOccurrenceId: null,
      sourceUrl: safeUrl(link),
      title: decodeEntities(title),
      description: htmlToText(inner),
      startsAt,
      endsAt,
      allDay: false,
      timezone: "America/New_York",
      location: loc ? decodeEntities(loc) : null,
      // Last host is the student org; earlier hosts are usually sponsoring departments.
      organizer: hosts.length ? hosts[hosts.length - 1]! : null,
      hosts,
      imageUrl: safeUrl(image ? decodeEntities(image) : null),
      categories: theme ? [themeToCategory(theme)!] : [],
      tags: Array.from(new Set(cats.slice(1).map(cleanTag).filter(Boolean))),
      costAmount: null,
      costText: null,
      eligibility: null,
      status: rawStatus === "cancelled" ? "cancelled" : rawStatus === "confirmed" ? "scheduled" : "unknown",
      sourceStatus: rawStatus,
      lastFetchedAt: fetchedAt,
      isDemo: false,
    });
  }
  return { events: out, skipped };
}

export async function fetchHeelLifeRss(ctx: AdapterContext, getText: typeof boundedText = boundedText) {
  const xml = await getText("https://heellife.unc.edu/events.rss", "heellife RSS", "application/rss+xml, application/xml");
  return { ...parseHeelLifeRss(xml, ctx.fetchedAt), complete: true };
}

/** Replaceable transports, tried in order. JSON first; RSS is the fallback. */
export interface HeelLifeTransport { name: string; run(ctx: AdapterContext): Promise<{ events: PulseEvent[]; skipped: number; complete: boolean }> }
export const DEFAULT_HEELLIFE_TRANSPORTS: HeelLifeTransport[] = [
  { name: "JSON", run: (c) => fetchHeelLifeJson(c) },
  { name: "RSS", run: (c) => fetchHeelLifeRss(c) },
];

export function createHeelLifeAdapter(transports: HeelLifeTransport[] = DEFAULT_HEELLIFE_TRANSPORTS): SourceAdapter {
  return {
    id: "heellife",
    optional: false,
    async fetch(ctx) {
      const warnings: string[] = [];
      const errors: string[] = [];
      for (const t of transports) {
        try {
          const r = await t.run(ctx);
          const limit = ctx.now.getTime() + ctx.windowDays * 86_400_000;
          if (errors.length) warnings.push(`heellife: ${errors.join("; ")} — used ${t.name} fallback.`);
          return { status: "ok", events: r.events.filter((e) => Date.parse(e.startsAt) < limit), complete: r.complete, skipped: r.skipped, warnings };
        } catch (err) {
          errors.push(`${t.name} failed (${(err as Error).message.slice(0, 120)})`);
        }
      }
      throw new Error(`heellife: ${errors.join("; ")}`);
    },
  };
}

export const heelLifeAdapter = createHeelLifeAdapter();

// Re-export for callers that only need JSON fetch helpers.
export { boundedJson };
