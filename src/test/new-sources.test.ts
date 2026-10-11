import { describe, expect, it } from "vitest";
import { mapTribeEvent, parseTribeUtc } from "@/modules/ingestion/tribe";
import { parseIcsFeed } from "@/modules/ingestion/ics-feeds";

const cfg = { id: "morehead" as const, endpoint: "https://x.test/wp-json/tribe/events/v1/events", organizer: "Morehead" };
const F = "2026-10-10T00:00:00Z";

describe("tribe adapter", () => {
  it("parses utc fields without Z as UTC", () => {
    expect(parseTribeUtc("2026-10-10 14:00:00")).toBe("2026-10-10T14:00:00.000Z");
  });
  it("handles venue [] / image false, entities, empty cost = unknown", () => {
    const e = mapTribeEvent({ id: 7, title: "Stars &amp; Planets", utc_start_date: "2026-10-10 14:00:00", venue: [], image: false, cost: "", status: "publish" }, cfg, F)!;
    expect(e.title).toBe("Stars & Planets");
    expect(e.location).toBeNull();
    expect(e.imageUrl).toBeNull();
    expect(e.costAmount).toBeNull();
    expect(e.status).toBe("unknown");
  });
  it("keeps all-day events date-only and price ranges unknown", () => {
    const e = mapTribeEvent({ id: 8, title: "Fair", all_day: true, start_date: "2026-11-01 00:00:00", end_date: "2026-11-01 23:59:59", cost: "Free – $10" }, cfg, F)!;
    expect(e.allDay).toBe(true);
    expect(e.startsAt).toBe("2026-11-01T04:00:00.000Z");
    expect(e.endsAt).toBe("2026-11-02T05:00:00.000Z"); // DST ended overnight
    expect(e.costAmount).toBeNull();
  });
});

const ics = (uid: string) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Pet Yoga\r\nDTSTART:20261107T153000Z\r\nLOCATION:<p>Animal Services</p>\r\nDESCRIPTION:See https://www.orangecountync.gov/calendar.aspx?EI\r\n D=8606\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const orange = { id: "orange-county" as const, organizer: "OC", defaultCategory: "Community", permalink: (_u: string | null, d: string | null) => (d?.match(/EID=(\d+)/) ? `https://www.orangecountync.gov/calendar.aspx?EID=${d.match(/EID=(\d+)/)![1]}` : null) };

describe("ics feeds", () => {
  it("unfolds lines, strips HTML location, finds permalink", () => {
    const [e] = parseIcsFeed(ics("a1"), orange, F).events;
    expect(e!.location).toBe("Animal Services");
    expect(e!.sourceUrl).toContain("EID=8606");
    expect(e!.id).toBe("orange-county:a1");
  });
  it("empty calendar is a healthy empty result; non-ICS throws", () => {
    expect(parseIcsFeed("BEGIN:VCALENDAR\r\nEND:VCALENDAR", orange, F).events).toEqual([]);
    expect(() => parseIcsFeed("<html>", orange, F)).toThrow();
  });
});
