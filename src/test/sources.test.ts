import { describe, expect, it, vi } from "vitest";
import { parseHeelLifeRss, type SourceAdapter } from "@/modules/ingestion/adapters";
import { createUncCalendarAdapter, mapLocalistPage } from "@/modules/ingestion/unc-calendar";
import { parseCarrboroIcs } from "@/modules/ingestion/carrboro";
import { createTicketmasterAdapter, mapTicketmaster } from "@/modules/ingestion/ticketmaster";
import { createImporter } from "@/modules/ingestion/importer";
import { hasEnded, zonedTimeToUtc } from "@/shared/time";
import type { PulseEvent } from "@/shared/types";

// All tests here are FIXTURE-based (small captured shapes); no live network.
const now = new Date("2026-10-10T16:00:00Z");
const at = now.toISOString();
const ctx = { now, fetchedAt: at, windowDays: 30 };

const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:ev="events"><channel>
<item><title>Build Day</title><link>https://heellife.unc.edu/event/12646310</link>
<pubDate>Sat, 01 Aug 2026 00:00:00 GMT</pubDate>
<ev:start>Sat, 10 Oct 2026 17:00:00 GMT</ev:start><ev:end>Sat, 10 Oct 2026 20:00:00 GMT</ev:end>
<ev:location>Weaver's Grove</ev:location><ev:status>confirmed</ev:status>
<ev:host>Biology Department</ev:host><ev:host>UNC Habitat</ev:host>
<category>CommunityService</category><category>Free Food</category></item>
<item><title>Cancelled</title><link>https://heellife.unc.edu/event/2</link>
<start xmlns="events">Sun, 11 Oct 2026 17:00:00 GMT</start><status xmlns="events">cancelled</status></item>
<item><title>No start</title><link>https://heellife.unc.edu/event/3</link></item>
<item><title>Wrong ns</title><link>https://heellife.unc.edu/event/4</link><start xmlns="other">Sun, 11 Oct 2026 17:00:00 GMT</start></item>
</channel></rss>`;

const localist = (page: number, total: number, events: any[]): any => ({ events, page: { current: page, total, next_page: page < total ? page + 1 : null } });
const lev = (id: number, instances: { id: number; start: string; end?: string | null; all_day?: boolean }[], extra: Record<string, unknown> = {}) => ({
  event: { id, title: `Event ${id}`, localist_url: `https://calendar.unc.edu/event/${id}`, status: "live", free: false, ticket_cost: null, event_instances: instances.map((i) => ({ event_instance: i })), ...extra },
});

describe("Heel Life RSS", () => {
  const r = parseHeelLifeRss(rss, at);
  it("reads times from the events namespace, not pubDate, and counts skipped", () => {
    const e = r.events.find((x) => x.sourceEventId === "12646310")!;
    expect(e.startsAt).toBe("2026-10-10T17:00:00.000Z");
    expect(e.endsAt).toBe("2026-10-10T20:00:00.000Z");
    expect(e.hosts).toEqual(["Biology Department", "UNC Habitat"]);
    expect(e.organizer).toBe("UNC Habitat");
    expect(e.id).toBe("heellife:12646310");
    expect(r.skipped).toBe(2);
  });
  it("keeps cancelled status, free food ≠ free", () => {
    expect(r.events.find((x) => x.sourceEventId === "2")!.status).toBe("cancelled");
    const e = r.events[0]!;
    expect(e.tags).toContain("free food");
    expect(e.costAmount).toBeNull();
  });
  it("rejects a non-RSS payload", () => {
    expect(() => parseHeelLifeRss("<html>blocked</html>", at)).toThrow();
  });
});

describe("UNC Calendar (Localist)", () => {
  it("keeps separate instances of the same parent and dedupes repeats", async () => {
    const page1 = localist(1, 2, [lev(9, [{ id: 1, start: "2026-10-11T19:00:00-04:00", end: "2026-10-11T21:00:00-04:00" }, { id: 2, start: "2026-10-18T19:00:00-04:00" }])]);
    const page2 = localist(2, 2, [lev(9, [{ id: 2, start: "2026-10-18T19:00:00-04:00" }])]);
    const pages = [page1, page2];
    const adapter = createUncCalendarAdapter({ fetchPage: async () => pages.shift()!, delayMs: 0 });
    const imp = createImporter([adapter]);
    const feed = await imp.getFeed(now);
    expect(feed.events.map((e) => e.id).sort()).toEqual(["unc-calendar:9:1", "unc-calendar:9:2"]);
    expect(feed.sources[0]!.complete).toBe(true);
  });
  it("a failed later page fails the source (no half snapshot)", async () => {
    let n = 0;
    const adapter = createUncCalendarAdapter({
      fetchPage: async () => {
        n++;
        if (n === 2) throw new Error("unc-calendar: HTTP 500");
        return localist(1, 3, [lev(1, [{ id: 1, start: "2026-10-11T19:00:00-04:00" }])]);
      },
      delayMs: 0,
    });
    await expect(adapter.fetch(ctx)).rejects.toThrow(/500/);
  });
  it("reports truncation at the page cap", async () => {
    const adapter = createUncCalendarAdapter({ fetchPage: async () => localist(1, 50, []), delayMs: 0, maxPages: 2 });
    const r = await adapter.fetch(ctx);
    expect(r.complete).toBe(false);
    expect(r.warnings[0]).toMatch(/truncated/);
  });
  it("all-day stays date-only; free:false is not paid; free:true is free", () => {
    const { events } = mapLocalistPage(localist(1, 1, [lev(5, [{ id: 7, start: "2026-10-10T00:00:00-04:00", end: null, all_day: true }]), lev(6, [{ id: 8, start: "2026-10-12T18:00:00-04:00" }], { free: true })]), at);
    const allDay = events[0]!;
    expect(allDay.allDay).toBe(true);
    expect(allDay.startsAt).toBe("2026-10-10T04:00:00.000Z");
    expect(allDay.endsAt).toBe("2026-10-11T04:00:00.000Z");
    expect(allDay.costAmount).toBeNull();
    expect(events[1]!.costAmount).toBe(0);
  });
  it("malformed payload throws", () => {
    expect(() => mapLocalistPage({} as never, at)).toThrow(/malformed/);
  });
});

describe("Carrboro iCalendar", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DESCRIPTION:Trivia night\\, food and fun. https://",
    " www.carrboronc.gov/calendar.aspx?EID=9359",
    "DTSTAMP;TZID=America/New_York:20260427T100959",
    "DTSTART;TZID=America/New_York:20261101T200000",
    "DTEND;TZID=America/New_York:20261101T220000",
    "LOCATION:Flying Pierogi\\, Carrboro",
    "SUMMARY:Trivia",
    "UID:9359",
    "URL:/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=46",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261108",
    "DTEND;VALUE=DATE:20261109",
    "SUMMARY:Fall Festival",
    "UID:77",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = parseCarrboroIcs(ics, at);
  it("unfolds lines, unescapes text, uses DTSTART (not DTSTAMP) and per-event link", () => {
    const e = r.events[0]!;
    expect(e.title).toBe("Trivia");
    expect(e.location).toBe("Flying Pierogi, Carrboro");
    expect(e.sourceUrl).toBe("https://www.carrboronc.gov/calendar.aspx?EID=9359");
    // Nov 1 2026 is the DST changeover day; 8pm is after the switch → EST (-05:00)
    expect(e.startsAt).toBe("2026-11-02T01:00:00.000Z");
  });
  it("all-day DTEND is exclusive and date-only", () => {
    const e = r.events[1]!;
    expect(e.allDay).toBe(true);
    expect(e.startsAt).toBe("2026-11-08T05:00:00.000Z");
    expect(e.endsAt).toBe("2026-11-09T05:00:00.000Z");
  });
});

describe("Ticketmaster (optional)", () => {
  it("missing key → unconfigured, no request", async () => {
    const fetchPage = vi.fn();
    const r = await createTicketmasterAdapter({ getKey: () => undefined, fetchPage }).fetch(ctx);
    expect(r.status).toBe("unconfigured");
    expect(fetchPage).not.toHaveBeenCalled();
  });
  it("TBA dates are skipped, missing price is not free, empty list is healthy", () => {
    const r = mapTicketmaster(
      { page: { totalPages: 1 }, _embedded: { events: [{ id: "a", name: "Show", dates: { start: { dateTime: "2026-10-20T23:00:00Z" } } }, { id: "b", name: "TBA", dates: { start: { localDate: "2026-11-01", timeTBA: true } } }] } },
      at,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0]!.costAmount).toBeNull();
    expect(r.skipped).toBe(1);
    expect(mapTicketmaster({ page: { totalPages: 0 } }, at).events).toEqual([]);
  });
});

describe("aggregation, cache and integrity", () => {
  const ev = (id: string, startsAt: string, endsAt: string | null, status: PulseEvent["status"] = "scheduled"): PulseEvent => ({
    id, source: "carrboro", sourceEventId: id, sourceUrl: null, title: id, description: null, startsAt, endsAt, timezone: "America/New_York",
    location: null, organizer: null, imageUrl: null, categories: [], tags: [], costAmount: null, costText: null, eligibility: null, status, lastFetchedAt: at, isDemo: false,
  });
  const ok = (id: SourceAdapter["id"], events: PulseEvent[]): SourceAdapter => ({ id, optional: false, fetch: async () => ({ status: "ok", events, complete: true, skipped: 0, warnings: [] }) });
  const fail = (id: SourceAdapter["id"]): SourceAdapter => ({ id, optional: false, fetch: async () => { throw new Error(`${id}: HTTP 503`); } });

  it("one failing source doesn't erase others; failed ≠ healthy empty; missing TM key isn't demo", async () => {
    const imp = createImporter([fail("heellife"), ok("unc-calendar", []), ok("carrboro", [ev("c1", "2026-10-12T20:00:00Z", null)]), createTicketmasterAdapter({ getKey: () => undefined })]);
    const f = await imp.getFeed(now);
    expect(f.origin).toBe("live");
    expect(f.events.map((e) => e.id)).toEqual(["c1"]);
    const by = Object.fromEntries(f.sources.map((s) => [s.source, s.status]));
    expect(by).toEqual({ heellife: "error", "unc-calendar": "ok", carrboro: "ok", ticketmaster: "unconfigured" });
    expect(f.events.every((e) => !e.isDemo)).toBe(true);
  });

  it("all healthy but empty → real empty state, not demo", async () => {
    const f = await createImporter([ok("heellife", [])]).getFeed(now);
    expect(f.origin).toBe("live");
    expect(f.events).toEqual([]);
  });

  it("every source failing → labelled demo only", async () => {
    const f = await createImporter([fail("heellife"), fail("carrboro")]).getFeed(now);
    expect(f.origin).toBe("demo");
    expect(f.events.every((e) => e.isDemo)).toBe(true);
  });

  it("caches 15 min, coalesces concurrent refreshes", async () => {
    const fn = vi.fn(async () => ({ status: "ok" as const, events: [], complete: true, skipped: 0, warnings: [] }));
    const imp = createImporter([{ id: "heellife", optional: false, fetch: fn }]);
    await Promise.all([imp.getFeed(now), imp.getFeed(now), imp.getFeed(now)]);
    await imp.getFeed(new Date(now.getTime() + 10 * 60_000));
    expect(fn).toHaveBeenCalledTimes(1);
    await imp.getFeed(new Date(now.getTime() + 16 * 60_000));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("serves stale last-known-good after a failure, marked stale", async () => {
    let n = 0;
    const imp = createImporter([{ id: "heellife", optional: false, fetch: async () => { if (n++) throw new Error("down"); return { status: "ok", events: [ev("h1", "2026-10-12T20:00:00Z", null)], complete: true, skipped: 0, warnings: [] }; } }]);
    await imp.getFeed(now);
    const f = await imp.getFeed(new Date(now.getTime() + 16 * 60_000));
    expect(f.events.map((e) => e.id)).toEqual(["h1"]);
    expect(f.sources[0]!.stale).toBe(true);
  });

  it("rechecks expiry from cache; cancelled removed but reported", async () => {
    const imp = createImporter([ok("carrboro", [ev("soon", "2026-10-10T17:00:00Z", "2026-10-10T18:00:00Z"), ev("x", "2026-10-12T17:00:00Z", null, "cancelled")])]);
    expect((await imp.getFeed(now)).events.map((e) => e.id)).toEqual(["soon"]);
    const later = await imp.getFeed(new Date("2026-10-10T19:00:00Z"));
    expect(later.events).toEqual([]);
    expect(later.cancelledIds).toEqual(["x"]);
  });
});

describe("time", () => {
  it("unknown end: started today is not ended; earlier day is", () => {
    expect(hasEnded({ startsAt: "2026-10-10T13:00:00Z", endsAt: null }, now)).toBe(false);
    expect(hasEnded({ startsAt: "2026-10-09T13:00:00Z", endsAt: null }, now)).toBe(true);
  });
  it("NY→UTC across DST", () => {
    expect(zonedTimeToUtc(2026, 3, 8, 12, 0, 0).toISOString()).toBe("2026-03-08T16:00:00.000Z");
    expect(zonedTimeToUtc(2026, 3, 7, 12, 0, 0).toISOString()).toBe("2026-03-07T17:00:00.000Z");
  });
});
