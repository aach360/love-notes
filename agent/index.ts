import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { Journal } from "./journal";
import { submitDelivery } from "./delivery";
import type { PhotonDelivery } from "../src/shared/types";

const projectId = process.env["SPECTRUM_PROJECT_ID"];
const projectSecret = process.env["SPECTRUM_PROJECT_SECRET"];
const base = process.env["PULSEMATCH_URL"]?.replace(/\/$/, "");
const token = process.env["PHOTON_AGENT_TOKEN"];
if (!projectId || !projectSecret || !base || !token)
  throw new Error(
    "Set SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, PULSEMATCH_URL and PHOTON_AGENT_TOKEN in agent/.env",
  );
const url = new URL(base);
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("PULSEMATCH_URL must use HTTPS");
const journal = new Journal(process.env["PHOTON_STATE_DIR"] ?? ".state");
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}/api/public/agent/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(25_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Site returned ${response.status}`);
  return (await response.json()) as T;
}
const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
const platform = imessage(app);
let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function inbound() {
  for await (const [rawSpace, message] of app.messages) {
    if (stopping) break;
    if (message.direction !== "inbound" || message.platform !== "imessage" || !message.sender)
      continue;
    const space = imessage(rawSpace);
    if (space.type !== "dm") continue;
    const content = message.content;
    const text =
      content.type === "text"
        ? content.text
        : content.type === "markdown"
          ? content.markdown
          : null;
    if (!text?.trim()) continue;
    journal.addInbound({
      projectId: projectId!,
      messageId: message.id,
      sender: message.sender.id,
      spaceId: space.id,
      lineAddress: space.phone,
      spaceType: "dm",
      text: text.trim().slice(0, 2000),
    });
  }
  if (!stopping) throw new Error("Photon message stream ended; restart the agent");
}
async function processInbox() {
  while (!stopping) {
    const message = journal.firstInbound();
    if (!message) {
      await sleep(500);
      continue;
    }
    try {
      await request("inbound", message);
      journal.removeInbound(message.messageId);
    } catch {
      console.error("Incoming message is retained for retry; check site availability.");
      await sleep(5000);
    }
  }
}
async function outbound() {
  while (!stopping) {
    try {
      const receipt = journal.firstReceipt();
      if (receipt) {
        const result = await request<{ ok: boolean }>("outbox", { projectId, ...receipt });
        // Acknowledgements may be repeated. A false result needs operator review, not a resend.
        if (!result.ok)
          console.error("Delivery acknowledgement was rejected; check server records.");
        journal.removeReceipt(receipt.id);
        continue;
      }
      const { message: job } = await request<{ message: PhotonDelivery | null }>(
        `outbox?projectId=${encodeURIComponent(projectId!)}`,
      );
      if (job) {
        // Resolve the stored conversation and original bot line after a restart.
        const space = await platform.space.get(job.spaceId, { phone: job.lineAddress });
        if (space.type !== "dm") throw new Error("Only direct messages are supported");
        let body = job.body;
        await submitDelivery(job, {
          prepare: async () => {
            const r = await request<{ ok: boolean; body: string | null }>("outbox", {
              projectId,
              id: job.id,
              lease: job.lease,
              action: "sending",
            });
            if (r.body) body = r.body;
            return r.ok && Boolean(r.body);
          },
          send: () => space.send(body),
          saveReceipt: (r) => journal.receipt(r),
        });
        continue;
      }
    } catch {
      console.error("Messaging poll failed; durable work is retained.");
    }
    await sleep(5000);
  }
}
process.on("SIGINT", () => {
  stopping = true;
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopping = true;
  process.exit(0);
});
console.log("Photon agent started. Site connection status requires a successful poll.");
await Promise.all([inbound(), processInbox(), outbound()]);
