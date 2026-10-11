import type { PulseEvent, SourceId } from "@/shared/types";
import { htmlToText, decodeEntities } from "./sanitize";
import { boundedJson, boundedText, safeUrl } from "./http";

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

/* ---------------- Heel Life JSON (observed website endpoint — NOT registered) ----------------
 * heellife.unc.edu/robots.txt excludes /api/, and this is not a published contract.
 * Kept only so old saved snapshots and tests map consistently. Official JSON access needs
 * campus-issued Anthology Engage API credentials (not configured; do not guess its schema).
 */

interface HeelLifeJsonEvent {
  id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  startsOn: string;
  endsOn?: string | null;
  imagePath?: string | null;
  organizationName?: string | null;
  theme?: string | null;
  categoryNames?: string[] | null;
  benefitNames?: string[] | null;
  status?: string | null;
  visibility?: string | null;
}

export function mapHeelLifeJson(e: HeelLifeJsonEvent, fetchedAt: string): PulseEvent {
  const cat = themeToCategory(e.theme);
  const tags = [...(e.categoryNames ?? []), ...(e.benefitNames ?? [])].map(cleanTag).filter(Boolean);
  return {
    id: `heellife:${e.id}`,
    source: "heellife-json",
    sourceEventId: String(e.id),
    sourceUrl: `https://heellife.unc.edu/event/${e.id}`,
    title: decodeEntities(e.name).trim(),
    description: htmlToText(e.description),
    startsAt: new Date(e.startsOn).toISOString(),
    endsAt: e.endsOn ? new Date(e.endsOn).toISOString() : null,
    timezone: "America/New_York",
    location: e.location?.trim() || null,
    organizer: e.organizationName?.trim() || null,
    imageUrl: e.imagePath ? `https://se-images.campuslabs.com/clink/images/${e.imagePath}?preset=med-w` : null,
    categories: cat ? [cat] : [],
    tags: Array.from(new Set(tags)),
    costAmount: null,
    costText: null,
    eligibility: null,
    status: e.status === "Approved" ? "scheduled" : "unknown",
    lastFetchedAt: fetchedAt,
    isDemo: false,
  };
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

export const heelLifeAdapter: SourceAdapter = {
  id: "heellife",
  optional: false,
  async fetch({ now, fetchedAt, windowDays }) {
    const xml = await boundedText("https://heellife.unc.edu/events.rss", "heellife RSS", "application/rss+xml, application/xml");
    const { events, skipped } = parseHeelLifeRss(xml, fetchedAt);
    // Feed spans months; keep the discovery window locally.
    const limit = now.getTime() + windowDays * 86_400_000;
    return { status: "ok", events: events.filter((e) => Date.parse(e.startsAt) < limit), complete: true, skipped, warnings: [] };
  },
};

// Re-export for callers that only need JSON fetch helpers.
export { boundedJson };
