import type { PulseEvent } from "@/shared/types";
import { nyDateKey } from "@/shared/time";

/** RFC 5545 export so events open in Apple/Google/Outlook calendars on a phone. */

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (key: string) => key.replace(/-/g, "");
const addDay = (key: string) => {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Fold to ≤75 chars per line (continuation lines start with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export function buildIcs(events: PulseEvent[], opts: { cancelledIds?: Set<string>; stamp?: Date } = {}): string {
  const stamp = utc((opts.stamp ?? new Date()).toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PulseMatch//UNC events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PulseMatch plan"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${esc(e.id)}@pulsematch`, `DTSTAMP:${stamp}`);
    if (e.allDay) {
      const sk = nyDateKey(e.startsAt);
      const ek = e.endsAt ? nyDateKey(new Date(new Date(e.endsAt).getTime() - 1)) : sk;
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(sk)}`, `DTEND;VALUE=DATE:${dateOnly(addDay(ek))}`);
    } else {
      lines.push(`DTSTART:${utc(e.startsAt)}`);
      // Unknown end time stays unknown — no invented duration.
      if (e.endsAt) lines.push(`DTEND:${utc(e.endsAt)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    const desc = [e.organizer ? `Host: ${e.organizer}` : "", e.sourceUrl ? `Details & registration: ${e.sourceUrl}` : "", "Saved in PulseMatch — saving is not an RSVP."].filter(Boolean).join("\n");
    lines.push(`DESCRIPTION:${esc(desc)}`);
    if (e.sourceUrl) lines.push(`URL:${e.sourceUrl}`);
    if (opts.cancelledIds?.has(e.id)) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
