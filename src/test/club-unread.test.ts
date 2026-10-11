import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { markClubRead, readTime } from "@/modules/clubs/unread";
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.useRealTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("starts at first visit and never moves a read cursor backwards", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T04:00:00Z"));
  expect(readTime("club", "device")).toBe("2026-10-11T04:00:00.000Z");
  markClubRead("club", "device", "2026-10-11T04:01:00.000Z");
  markClubRead("club", "device", "2026-10-11T03:00:00.000Z");
  expect(readTime("club", "device")).toBe("2026-10-11T04:01:00.000Z");
  expect(readTime("other", "device")).toBe("2026-10-11T04:00:00.000Z");
  vi.useRealTimers();
});
