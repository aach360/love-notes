// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkGoogleOAuth } from "@/modules/auth/google.server";

const base = "https://project.supabase.co";
const callback = "http://localhost:8080/auth";
describe("direct Google OAuth readiness", () => {
  it("handles missing credentials without requesting a provider", async () => {
    const request = vi.fn();
    expect((await checkGoogleOAuth(undefined, undefined, callback, request)).ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps users on the app when the provider has no OAuth secret", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response('{"msg":"Unsupported provider: missing OAuth secret"}', { status: 400 }),
      );
    expect((await checkGoogleOAuth(base, "public-key", callback, request)).ok).toBe(false);
    expect(request.mock.calls[0]![1].redirect).toBe("manual");
  });
  it("accepts a direct HTTPS Google authorization destination", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://accounts.google.com/o/oauth2/auth?state=example" },
      }),
    );
    expect((await checkGoogleOAuth(base, "public-key", callback, request)).ok).toBe(true);
  });
  it("rejects a broker redirect or a misleading Google hostname", async () => {
    for (const location of [
      "https://broker.example/auth",
      "https://accounts.google.com.example/auth",
      "http://accounts.google.com/auth",
    ]) {
      const request = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
      expect((await checkGoogleOAuth(base, "public-key", callback, request)).ok).toBe(false);
    }
  });
  it("returns a retryable error on network failure", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    expect((await checkGoogleOAuth(base, "public-key", callback, request)).error).toContain(
      "Try again",
    );
  });
});
