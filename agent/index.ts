/**
 * PulseMatch iMessage agent — built on Photon Spectrum (photon.codes/spectrum).
 * Runs as a long-lived process (laptop or any always-on box), NOT inside the website.
 *
 *   cd agent && bun install && bun run index.ts
 *
 * Env: SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET (from app.photon.codes, promo HACKWITHPHOTON),
 *      PULSEMATCH_URL (e.g. https://<your-site>.lovable.app), PHOTON_AGENT_TOKEN (same value as the website's secret).
 */
// PulseMatch's Photon project — created via the HACKWITHPHOTON hackathon promo.
const PROJECT_ID = process.env.SPECTRUM_PROJECT_ID ?? process.env.PROJECT_ID ?? "440f4b28-11a2-46d8-b24a-5dc0d7f5452f";
const PROJECT_SECRET = process.env.SPECTRUM_PROJECT_SECRET ?? process.env.PROJECT_SECRET;

import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const BASE = process.env.PULSEMATCH_URL?.replace(/\/$/, "");
const TOKEN = process.env.PHOTON_AGENT_TOKEN;
if (!BASE || !TOKEN || !PROJECT_SECRET) {
  console.error("Missing env: SPECTRUM_PROJECT_SECRET, PULSEMATCH_URL, PHOTON_AGENT_TOKEN (legacy PROJECT_SECRET is also accepted)");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
 
const app = await Spectrum({
  projectId: PROJECT_ID,
  projectSecret: PROJECT_SECRET,
  providers: [imessage.config()],
});

// Remember each phone's conversation so outbound texts reuse it.
const spaces = new Map<string, any>();

async function inbound() {
  for await (const [space, message] of app.messages) {
    const from: string = (message as any).sender?.id ?? (message as any).from ?? "";
    // Spectrum delivers text as { type: "text", text } (or { type: "markdown", markdown }).
    const c: any = (message as any).content;
    const text: string =
      typeof c === "string" ? c : c?.type === "markdown" ? c.markdown ?? "" : c?.text ?? "";
    if (!from || !text) continue;
    spaces.set(from, space);
    await space.responding(async () => {
      const r = await fetch(`${BASE}/api/public/agent/inbound`, { method: "POST", headers, body: JSON.stringify({ from, text }) });
      const j = (await r.json().catch(() => ({}))) as { reply?: string | null };
      if (j.reply) await message.reply(j.reply);
    });
  }
}

async function outbound() {
  let cursor = new Date().toISOString();
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/public/agent/outbox?since=${encodeURIComponent(cursor)}`, { headers });
      if (r.ok) {
        const j = (await r.json()) as { cursor: string; messages: { to: string; text: string }[] };
        cursor = j.cursor;
        for (const m of j.messages) {
          const space = spaces.get(m.to);
          // Spectrum can only reply into conversations it has seen; members start one by texting "join CODE Name".
          if (space?.send) await space.send(m.text);
          else console.warn("No open conversation yet for", m.to);
        }
      }
    } catch (e) {
      console.error("outbox poll failed", e);
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
}

console.log("PulseMatch iMessage agent running");
await Promise.all([inbound(), outbound()]);
