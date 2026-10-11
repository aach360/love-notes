import { afterEach, expect, it, vi } from "vitest";
import { generateReply } from "@/modules/assistant/gemini.server";

afterEach(() => vi.unstubAllGlobals());
it("rejects event ids invented by the model", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ text: "Try this event", eventIds: ["invented"] }) }],
            },
          },
        ],
      }),
    }),
  );
  const reply = await generateReply("test-key", { question: "events", history: [] }, []);
  expect(reply.status).toBe("unavailable");
  expect(reply.events).toEqual([]);
});
it("returns validated structured replies without exposing the key", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  text: "Join a club using its invite code.",
                  eventIds: [],
                }),
              },
            ],
          },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const reply = await generateReply("private-key", { question: "join a club", history: [] }, []);
  expect(reply.status).toBe("ready");
  expect(JSON.stringify(reply)).not.toContain("private-key");
  expect(fetcher.mock.calls[0]?.[0]).not.toContain("private-key");
});
