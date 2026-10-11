import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const request = (token?: string) =>
  new Request("https://example.com/api/public/hooks/refresh", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
afterEach(() => vi.unstubAllEnvs());

describe("independent refresh authentication", () => {
  it("rejects refreshes without a configured server secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await authenticateCronRequest(request("anything")))?.status).toBe(500);
  });
  it("rejects missing and incorrect credentials", async () => {
    vi.stubEnv("CRON_SECRET", "current-secret");
    vi.stubEnv("CRON_SECRET_PREVIOUS", "");
    expect((await authenticateCronRequest(request()))?.status).toBe(401);
    expect((await authenticateCronRequest(request("wrong")))?.status).toBe(401);
  });
  it("accepts the current and rotating previous secret", async () => {
    vi.stubEnv("CRON_SECRET", "current-secret");
    vi.stubEnv("CRON_SECRET_PREVIOUS", "previous-secret");
    expect(await authenticateCronRequest(request("current-secret"))).toBeNull();
    expect(await authenticateCronRequest(request("previous-secret"))).toBeNull();
  });
});
