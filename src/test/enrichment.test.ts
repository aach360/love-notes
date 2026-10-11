import { describe, expect, it, vi } from "vitest";
import { createEnrichmentCache } from "@/modules/ingestion/enrichment";
import { featureKeys } from "@/modules/recommendations/ranking";
import { buildDemoEvents } from "@/fixtures/demo-events";
import type { PulseEvent } from "@/shared/types";

const real = (): PulseEvent[] => buildDemoEvents().slice(0, 3).map((e, i) => ({ ...e, id: `t:${i}`, isDemo: false, tags: ["music"], costAmount: null, costText: null }));

describe("AI enrichment", () => {
  it("adds only aiSummary/aiTags, dedupes tags against source tags", async () => {
    const c = createEnrichmentCache();
    const evs = real();
    const fn = vi.fn(async () => ({ status: "ok" as const, data: { summary: "A show.", tags: ["Music", "jazz", "jazz"] } }));
    const s = await c.run(evs, fn);
    expect(s.enriched).toBe(3);
    const [e] = c.apply(evs);
    expect(e!.aiSummary).toBe("A show.");
    expect(e!.aiTags).toEqual(["jazz"]);
    expect(e!.description).toBe(evs[0]!.description);
    expect(e!.costAmount).toBeNull();
  });
  it("reuses cache for unchanged events, re-enriches changed ones", async () => {
    const c = createEnrichmentCache();
    const evs = real();
    const fn = vi.fn(async () => ({ status: "ok" as const, data: { summary: "x", tags: [] } }));
    await c.run(evs, fn);
    await c.run(evs, fn);
    expect(fn).toHaveBeenCalledTimes(3);
    await c.run([{ ...evs[0]!, title: "Changed" }, ...evs.slice(1)], fn);
    expect(fn).toHaveBeenCalledTimes(4);
  });
  it("invalid output / provider failure keeps source-only events", async () => {
    const c = createEnrichmentCache();
    const evs = real();
    const s = await c.run(evs, async () => ({ status: "error", message: "Gemini output failed validation" }));
    expect(s.status).toBe("error");
    expect(c.apply(evs)).toEqual(evs);
    const u = await c.run(evs, async () => ({ status: "unconfigured" }));
    expect(u.status).toBe("unconfigured");
    expect(u.attempted).toBeLessThanOrEqual(2); // stops after in-flight calls
  });
  it("caps work per run", async () => {
    const c = createEnrichmentCache();
    const evs = Array.from({ length: 20 }, (_, i) => ({ ...real()[0]!, id: `n:${i}` }));
    const s = await c.run(evs, async () => ({ status: "ok", data: { summary: "x", tags: [] } }));
    expect(s.enriched).toBe(12);
  });
  it("ranking counts a tag shared by source and AI once", () => {
    const keys = featureKeys({ ...real()[0]!, tags: ["jazz"], aiTags: ["Jazz"] });
    expect(keys.filter((k) => k === "tag:jazz")).toHaveLength(1);
  });
});
