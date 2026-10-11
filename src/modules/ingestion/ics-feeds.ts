import type { PulseEvent } from "@/shared/types";
import { nyMidnightIso } from "@/shared/time";
import { boundedText, safeUrl, sleep } from "./http";
import type { SourceAdapter } from "./adapters";
import { parseIcsDate, parseIcsProps, unescapeIcs } from "./carrboro";
import { htmlToText } from "./sanitize";

export const UNC_LIBRARIES_URL = "https://calendar.lib.unc.edu/ical_subscribe.php?src=p&cid=2998";
export const ORANGE_COUNTY_URLS = [
  "https://www.orangecountync.gov/common/modules/iCalendar/iCalendar.aspx?catID=46&feed=calendar",
  "https://www.orangecountync.gov/common/modules/iCalendar/iCalendar.aspx?catID=45&feed=calendar",
];

interface IcsConfig {
  id: "unc-libraries" | "orange-county";
  organizer: string;
  /** Pick the per-event page link. */
  permalink: (urlProp: string | null, desc: string | null) => string | null;
  defaultCategory: string;
}

const addDay = (key: string) => {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export function parseIcsFeed(text: string, cfg: IcsConfig, fetchedAt: string): { events: PulseEvent[]; skipped: number; rrules: number } {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error(`${cfg.id}: not an iCalendar document`);
  const props = parseIcsProps(text);
  const events: PulseEvent[] = [];
  let skipped = 0;
  let rrules = 0;
  let cur: ReturnType<typeof parseIcsProps> | null = null;
  for (const p of props) {
    if (p.name === "BEGIN" && p.value === "VEVENT") cur = [];
    else if (p.name === "END" && p.value === "VEVENT" && cur) {
      const get = (n: string) => cur!.find((x) => x.name === n);
      const uid = get("UID")?.value.trim();
      const summary = get("SUMMARY") ? htmlToText(unescapeIcs(get("SUMMARY")!.value)) ?? "" : "";
      const ds = get("DTSTART") ? parseIcsDate(get("DTSTART")!) : null; // never DTSTAMP
      if (get("RRULE")) rrules++;
      if (!uid || !summary || !ds) {
        skipped++;
        cur = null;
        continue;
      }
      const de = get("DTEND") ? parseIcsDate(get("DTEND")!) : null;
      const recur = get("RECURRENCE-ID")?.value.trim() ?? null;
      const rawDesc = get("DESCRIPTION") ? unescapeIcs(get("DESCRIPTION")!.value) : null;
      const status = get("STATUS")?.value.trim().toUpperCase() ?? null;
      const cats = get("CATEGORIES") ? unescapeIcs(get("CATEGORIES")!.value).split(",").map((s) => s.trim()).filter(Boolean) : [];
      const loc = get("LOCATION") ? htmlToText(unescapeIcs(get("LOCATION")!.value))?.replace(/\s+/g, " ") ?? null : null;
      const startsAt = ds.iso;
      let endsAt = de ? de.iso : ds.dateOnly ? nyMidnightIso(addDay(ds.key)) : null;
      if (endsAt && endsAt < startsAt) endsAt = null;
      events.push({
        id: recur ? `${cfg.id}:${uid}:${recur}` : `${cfg.id}:${uid}`,
        source: cfg.id,
        sourceEventId: uid,
        sourceOccurrenceId: recur,
        sourceUrl: cfg.permalink(get("URL")?.value.trim() ?? null, rawDesc),
        title: summary,
        description: htmlToText(rawDesc?.replace(/https?:\/\/\S+calendar\.aspx\?EID=\d+/gi, "")),
        startsAt,
        endsAt,
        allDay: ds.dateOnly,
        timezone: "America/New_York",
        location: loc || null,
        organizer: cfg.organizer,
        hosts: [],
        imageUrl: null,
        categories: cats.length ? cats : [cfg.defaultCategory],
        tags: [],
        costAmount: null,
        costText: null,
        eligibility: null,
        status: status === "CANCELLED" ? "cancelled" : status === "CONFIRMED" ? "scheduled" : "unknown",
        sourceStatus: status,
        lastFetchedAt: fetchedAt,
        isDemo: false,
      });
      cur = null;
    } else if (cur) cur.push(p);
  }
  return { events, skipped, rrules };
}

const LIBRARIES: IcsConfig = {
  id: "unc-libraries",
  organizer: "UNC University Libraries",
  defaultCategory: "Learning",
  permalink: (u) => safeUrl(u),
};
const ORANGE: IcsConfig = {
  id: "orange-county",
  organizer: "Orange County calendar",
  defaultCategory: "Community",
  // The URL property points to the feed itself; the event page lives in DESCRIPTION.
  permalink: (_u, desc) => {
    const m = desc?.match(/https?:\/\/www\.orangecountync\.gov\/calendar\.aspx\?EID=(\d+)/i);
    return m ? `https://www.orangecountync.gov/calendar.aspx?EID=${m[1]}` : null;
  },
};

function windowFilter(events: PulseEvent[], now: Date, windowDays: number) {
  const limit = now.getTime() + windowDays * 86_400_000;
  return events.filter((e) => new Date(e.startsAt).getTime() < limit);
}

function warn(id: string, rrules: number) {
  return rrules ? [`${id}: ${rrules} event(s) use RRULE recurrence, which isn't expanded — only their first occurrence is listed.`] : [];
}

export const uncLibrariesAdapter: SourceAdapter = {
  id: "unc-libraries",
  optional: false,
  async fetch({ now, fetchedAt, windowDays }) {
    const r = parseIcsFeed(await boundedText(UNC_LIBRARIES_URL, "unc-libraries iCalendar", "text/calendar"), LIBRARIES, fetchedAt);
    // Feed includes past events; the importer drops ended ones on every read.
    return { status: "ok", events: windowFilter(r.events, now, windowDays), complete: true, skipped: r.skipped, warnings: warn("unc-libraries", r.rrules) };
  },
};

export const orangeCountyAdapter: SourceAdapter = {
  id: "orange-county",
  optional: false,
  async fetch({ now, fetchedAt, windowDays }) {
    // Category feeds can repeat an event: one publisher-level identity (orange-county:UID) dedupes them.
    const byId = new Map<string, PulseEvent>();
    let skipped = 0;
    let rrules = 0;
    for (const [i, url] of ORANGE_COUNTY_URLS.entries()) {
      if (i) await sleep(500);
      const r = parseIcsFeed(await boundedText(url, `orange-county iCalendar ${i + 1}`, "text/calendar"), ORANGE, fetchedAt);
      skipped += r.skipped;
      rrules += r.rrules;
      for (const e of r.events) if (!byId.has(e.id)) byId.set(e.id, e);
    }
    return { status: "ok", events: windowFilter([...byId.values()], now, windowDays), complete: true, skipped, warnings: warn("orange-county", rrules) };
  },
};
