import { describe, expect, it } from "vitest";
import {
  parseCommand,
  isReminderDue,
  canRemind,
  reminderTime,
  isAgentOnline,
} from "@/modules/assistant/messaging/domain";
import type { PulseEvent } from "@/shared/types";
const event = (overrides: Partial<PulseEvent> = {}): PulseEvent => ({
  id: "unc:123",
  source: "unc-calendar",
  sourceEventId: "123",
  title: "Test",
  sourceUrl: null,
  description: null,
  startsAt: "2026-10-10T18:00:00-04:00",
  endsAt: null,
  timezone: "America/New_York",
  location: null,
  organizer: null,
  imageUrl: null,
  categories: [],
  tags: [],
  costAmount: null,
  costText: null,
  eligibility: null,
  status: "scheduled",
  lastFetchedAt: "2026-10-10T10:00:00-04:00",
  isDemo: false,
  ...overrides,
});
describe("Photon event commands", () => {
  it("keeps ordinary questions private instead of posting to a club", () => {
    expect(parseCommand("what is happening tonight?")).toEqual({
      command: "ask",
      question: "what is happening tonight?",
    });
    expect(parseCommand("ABC123 hello club")).toEqual({
      command: "club",
      clubCode: "ABC123",
      clubBody: "hello club",
    });
  });
  it("recognizes opt-out before other commands", () => {
    expect(parseCommand(" StOp ")).toEqual({ command: "stop" });
    expect(parseCommand("reminders   off")).toEqual({ command: "reminders_off" });
  });
  it("requires an exact event reference and supported lead time", () => {
    expect(parseCommand("remind unc:123 30")).toEqual({
      command: "remind",
      eventId: "unc:123",
      leadMinutes: 30,
    });
    expect(parseCommand("remind that one")).toMatchObject({ command: "ask" });
  });
});
describe("reminder eligibility", () => {
  it("allows at most five minutes lateness and never sends after start", () => {
    expect(isReminderDue(event(), 30, new Date("2026-10-10T21:29:59Z"))).toBe(false);
    expect(isReminderDue(event(), 30, new Date("2026-10-10T21:30:00Z"))).toBe(true);
    expect(isReminderDue(event(), 30, new Date("2026-10-10T21:34:59Z"))).toBe(true);
    expect(isReminderDue(event(), 30, new Date("2026-10-10T21:35:01Z"))).toBe(false);
    expect(isReminderDue(event(), 30, new Date("2026-10-10T22:00:00Z"))).toBe(false);
  });
  it("rejects cancelled, demo, all-day, stale and missing-date listings", () => {
    const now = new Date("2026-10-10T21:30:00Z");
    for (const overrides of [
      { status: "cancelled" as const },
      { isDemo: true },
      { allDay: true },
      { lastFetchedAt: "2026-09-01T00:00:00Z" },
      { startsAt: "invalid" },
    ])
      expect(isReminderDue(event(overrides), 30, now)).toBe(false);
  });
  it("uses the Eastern day, not the UTC date", () => {
    expect(
      canRemind(event({ startsAt: "2026-10-11T00:15:00Z" }), new Date("2026-10-11T00:00:00Z")),
    ).toBe(true);
    expect(
      canRemind(
        event({ startsAt: "2026-10-10T23:30:00-04:00", endsAt: "2026-10-11T04:00:00-04:00" }),
        new Date("2026-10-11T00:01:00-04:00"),
      ),
    ).toBe(false);
  });
  it("subtracts elapsed minutes across both DST transitions", () => {
    expect(
      new Date(reminderTime(event({ startsAt: "2026-03-08T03:15:00-04:00" }), 30)!).toISOString(),
    ).toBe("2026-03-08T06:45:00.000Z");
    expect(
      new Date(reminderTime(event({ startsAt: "2026-11-01T01:15:00-05:00" }), 30)!).toISOString(),
    ).toBe("2026-11-01T05:45:00.000Z");
  });
  it("does not label a configured but stale agent online", () => {
    expect(isAgentOnline(null)).toBe(false);
    expect(isAgentOnline("2026-10-10T10:00:00Z", Date.parse("2026-10-10T10:02:00Z"))).toBe(false);
    expect(isAgentOnline("2026-10-10T10:00:00Z", Date.parse("2026-10-10T10:00:15Z"))).toBe(true);
  });
});
