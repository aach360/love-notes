import { describe, expect, it } from "vitest";
import { matchPoster } from "@/modules/scanner/match";
import { buildDemoEvents } from "./fixtures/demo-events";

const events = buildDemoEvents(new Date("2026-10-11T12:00:00Z"));
describe("poster matches", () => {
  it("ranks the matching title ahead of related listings", () => {
    const matches = matchPoster("Jazz Ensemble Fall Concert", events, []);
    expect(matches.events[0]?.title).toBe("Jazz Ensemble Fall Concert");
    expect(matches.events.every((event) => events.includes(event))).toBe(true);
  });
  it("shows one result for duplicate listings and recurring titles", () => {
    const event = events.find((item) => item.title.includes("Jazz"))!;
    const matches = matchPoster(
      "Jazz Ensemble Fall Concert",
      [event, { ...event, id: "other-source" }],
      [],
    );
    expect(matches.events).toEqual([event]);
  });
  it("does not invent a listing for unrelated or generic text", () => {
    expect(matchPoster("Join the UNC event in Chapel Hill", events, []).events).toEqual([]);
    expect(matchPoster("intergalactic zebras", events, []).events).toEqual([]);
    expect(matchPoster("Free campus events October Sunday", events, []).events).toEqual([]);
  });
  it("matches only existing clubs and limits results", () => {
    const clubs = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: "Jazz Club",
      description: null,
      memberCount: 2,
      createdAt: "2026-10-11",
    }));
    expect(matchPoster("Jazz Club", [], clubs).clubs).toEqual(clubs.slice(0, 3));
  });
});
