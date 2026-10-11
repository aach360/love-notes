import type { PulseEvent } from "@/shared/types";
import { nyMidnightIso, zonedTimeToUtc } from "@/shared/time";
import { boundedText, safeUrl } from "./http";
import type { SourceAdapter } from "./adapters";

/** Carrboro Community Events Calendar (iCalendar). Linked from carrboronc.gov/iCalendar.aspx. */
export const CARRBORO_URL = "https://www.carrboronc.gov/common/modules/iCalendar/iCalendar.aspx?catID=46&feed=calendar";

interface IcsProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Unfold lines (RFC 5545 §3.1) and split into properties. */
export function parseIcsProps(text: string): IcsProp[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: IcsProp[] = [];
  for (const line of lines) {
    if (!line) continue;
    const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const [name = "", ...ps] = head.split(";");
    const params: Record<string, string> = {};
    for (const p of ps) {
      const [k, v] = p.split("=");
      if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
    }
    out.push({ name: name.toUpperCase(), params, value: line.slice(colon + 1) });
  }
  return out;
}

export function unescapeIcs(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** Returns ISO instant and whether the value was date-only. */
export function parseIcsDate(p: IcsProp): { iso: string; dateOnly: boolean; key: string } | null {
  const v = p.value.trim();
  const dateOnly = p.params["VALUE"] === "DATE" || /^\d{8}$/.test(v);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  if (dateOnly) return { iso: nyMidnightIso(key), dateOnly: true, key };
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (m[7]) return { iso: new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString(), dateOnly: false, key };
  // TZID or floating time: Carrboro publishes America/New_York.
  const tz = p.params["TZID"] ?? "America/New_York";
  return { iso: zonedTimeToUtc(y, mo, d, h, mi, s, tz).toISOString(), dateOnly: false, key };
}

export function parseCarrboroIcs(text: string, fetchedAt: string): { events: PulseEvent[]; skipped: number; warnings: string[] } {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("carrboro: not an iCalendar document");
  const props = parseIcsProps(text);
  const events: PulseEvent[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let rrules = 0;
  let cur: IcsProp[] | null = null;
  for (const p of props) {
    if (p.name === "BEGIN" && p.value === "VEVENT") cur = [];
    else if (p.name === "END" && p.value === "VEVENT" && cur) {
      const get = (n: string) => cur!.find((x) => x.name === n);
      const uid = get("UID")?.value.trim();
      const summary = get("SUMMARY") ? unescapeIcs(get("SUMMARY")!.value) : "";
      const ds = get("DTSTART") ? parseIcsDate(get("DTSTART")!) : null; // never DTSTAMP
      if (get("RRULE")) rrules++;
      if (!uid || !summary || !ds) {
        skipped++;
        cur = null;
        continue;
      }
      const de = get("DTEND") ? parseIcsDate(get("DTEND")!) : null; // all-day DTEND is already exclusive
      const recur = get("RECURRENCE-ID")?.value.trim() ?? null;
      const desc = get("DESCRIPTION") ? unescapeIcs(get("DESCRIPTION")!.value) : null;
      // The URL property points to the shared feed; the per-event link lives in DESCRIPTION.
      const eid = desc?.match(/https?:\/\/www\.carrboronc\.gov\/calendar\.aspx\?EID=(\d+)/i);
      const status = get("STATUS")?.value.trim().toUpperCase() ?? null;
      const allDay = ds.dateOnly;
      events.push({
        id: recur ? `carrboro:${uid}:${recur}` : `carrboro:${uid}`,
        source: "carrboro",
        sourceEventId: uid,
        sourceOccurrenceId: recur,
        sourceUrl: eid ? safeUrl(`https://www.carrboronc.gov/calendar.aspx?EID=${eid[1]}`) : null,
        title: summary,
        description: desc ? desc.replace(/https?:\/\/www\.carrboronc\.gov\/calendar\.aspx\?EID=\d+/i, "").trim() || null : null,
        startsAt: ds.iso,
        endsAt: de ? de.iso : allDay ? nyMidnightIso(addDay(ds.key)) : null,
        allDay,
        timezone: "America/New_York",
        location: get("LOCATION") ? unescapeIcs(get("LOCATION")!.value).replace(/\s{2,}/g, " ") || null : null,
        organizer: "Town of Carrboro calendar",
        hosts: [],
        imageUrl: null,
        categories: ["Community"],
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
  if (rrules) warnings.push(`carrboro: ${rrules} event(s) use RRULE recurrence, which isn't expanded — only their first occurrence is listed.`);
  return { events, skipped, warnings };
}

function addDay(key: string) {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export const carrboroAdapter: SourceAdapter = {
  id: "carrboro",
  optional: false,
  async fetch({ now, fetchedAt, windowDays }) {
    const text = await boundedText(CARRBORO_URL, "carrboro iCalendar", "text/calendar");
    const r = parseCarrboroIcs(text, fetchedAt);
    // Feed spans years; keep only the discovery window.
    const limit = now.getTime() + windowDays * 86_400_000;
    const events = r.events.filter((e) => new Date(e.startsAt).getTime() < limit);
    return { status: "ok", events, complete: true, skipped: r.skipped, warnings: r.warnings };
  },
};
