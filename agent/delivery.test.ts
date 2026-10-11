import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Journal, type Receipt } from "./journal";
import { submitDelivery } from "./delivery";
const job = { id: "job", lease: "lease", spaceId: "space", lineAddress: "line", body: "Reminder" };
describe("durable Photon delivery", () => {
  test("does not send after the final consent gate rejects", async () => {
    let sent = false;
    await submitDelivery(job, {
      prepare: async () => false,
      send: async () => {
        sent = true;
        return { id: "provider" };
      },
      saveReceipt: () => {},
    });
    expect(sent).toBe(false);
  });
  test("records uncertainty before submission and provider acknowledgement after", async () => {
    const receipts: Receipt[] = [];
    await submitDelivery(job, {
      prepare: async () => true,
      send: async () => {
        expect(receipts[0]?.action).toBe("unknown");
        return { id: "provider" };
      },
      saveReceipt: (r) => receipts.push(r),
    });
    expect(receipts.at(-1)).toMatchObject({ action: "sent", providerId: "provider" });
  });
  test("does not retry an ambiguous send failure", async () => {
    const receipts: Receipt[] = [];
    let calls = 0;
    await submitDelivery(job, {
      prepare: async () => true,
      send: async () => {
        calls++;
        throw new Error("connection lost");
      },
      saveReceipt: (r) => receipts.push(r),
    });
    expect(calls).toBe(1);
    expect(receipts.at(-1)?.action).toBe("unknown");
  });
  test("retains inbound messages and acknowledgements across restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "photon-test-"));
    try {
      const first = new Journal(directory);
      const inbound = {
        projectId: "project",
        messageId: "message",
        sender: "person",
        spaceId: "space",
        lineAddress: "line",
        spaceType: "dm" as const,
        text: "plan",
      };
      first.addInbound(inbound);
      first.addInbound(inbound);
      first.receipt({ id: "job", lease: "lease", action: "sent", providerId: "provider" });
      const restarted = new Journal(directory);
      expect(restarted.firstInbound()).toEqual(inbound);
      expect(restarted.firstReceipt()?.providerId).toBe("provider");
      restarted.removeInbound("message");
      expect(restarted.firstInbound()).toBeUndefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
