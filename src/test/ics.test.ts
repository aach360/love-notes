import { describe, expect, it } from "vitest";
import { buildIcs } from "@/modules/plan/ics";
import { parseIcsFeed } from "@/modules/ingestion/ics-feeds";
import { buildDemoEvents } from "@/fixtures/demo-events";

describe("calendar export", () => {
  it("round-trips through our own ICS parser and escapes text", () => {
    const [a, b] = buildDemoEvents();
    const ev = { ...a!, title: "Jazz, Poetry; & more", endsAt: null };
    const ics = buildIcs([ev, { ...b!, allDay: true }]);
    expect(ics).toMatch(/SUMMARY:Jazz\\, Poetry\\; & more/);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
    const r = parseIcsFeed(ics, { id: "unc-libraries", organizer: "x", defaultCategory: "x", permalink: () => null }, "t");
    expect(r.events).toHaveLength(2);
    expect(r.events[0]!.title).toBe("Jazz, Poetry; & more");
    expect(r.events[0]!.endsAt).toBeNull(); // unknown end not invented
    expect(r.events[0]!.startsAt).toBe(new Date(ev.startsAt).toISOString().replace(/\.\d{3}Z$/, ".000Z"));
  });
});
