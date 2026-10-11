// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
const service = vi.hoisted(() => ({
  receive: vi.fn(),
  poll: vi.fn(),
  delivery: vi.fn(),
  preparedBody: vi.fn(),
}));
vi.mock("@/modules/assistant/messaging/service.server", () => service);
import { inboundHandler, outboxHandler } from "@/modules/assistant/messaging/http.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const req = (body: unknown, token = "test-token") =>
  new Request("https://app.example/api/public/agent/inbound", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const body = {
  projectId: "11111111-1111-4111-8111-111111111111",
  sender: "student@example.test",
  messageId: "message",
  spaceId: "any;-;student@example.test",
  lineAddress: "line",
  spaceType: "dm",
  text: "plan",
};
describe("agent HTTP boundary", () => {
  it("returns unconfigured without a server token", async () => {
    vi.stubEnv("PHOTON_AGENT_TOKEN", "");
    expect((await inboundHandler(req(body))).status).toBe(503);
    expect(service.receive).not.toHaveBeenCalled();
  });
  it("rejects unauthorized requests before processing", async () => {
    vi.stubEnv("PHOTON_AGENT_TOKEN", "test-token");
    expect((await inboundHandler(req(body, "wrong"))).status).toBe(401);
    expect(service.receive).not.toHaveBeenCalled();
  });
  it("rejects group messages and missing provider identities", async () => {
    vi.stubEnv("PHOTON_AGENT_TOKEN", "test-token");
    expect((await inboundHandler(req({ ...body, spaceType: "group" }))).status).toBe(400);
    expect((await inboundHandler(req({ ...body, messageId: "" }))).status).toBe(400);
    expect(service.receive).not.toHaveBeenCalled();
  });
  it("acknowledges only after durable processing succeeds", async () => {
    vi.stubEnv("PHOTON_AGENT_TOKEN", "test-token");
    service.receive.mockRejectedValueOnce(new Error("database offline"));
    expect((await inboundHandler(req(body))).status).toBe(503);
    service.receive.mockResolvedValueOnce(undefined);
    expect((await inboundHandler(req(body))).status).toBe(200);
  });
  it("does not turn an outbox database failure into an empty success", async () => {
    vi.stubEnv("PHOTON_AGENT_TOKEN", "test-token");
    service.poll.mockRejectedValue(new Error("offline"));
    const request = new Request(
      `https://app.example/api/public/agent/outbox?projectId=${body.projectId}`,
      { headers: { authorization: "Bearer test-token" } },
    );
    expect((await outboxHandler(request)).status).toBe(503);
  });
});
