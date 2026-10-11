import { createServerFn } from "@tanstack/react-start";
import type { Club, PulseEvent } from "@/shared/types";

/** What Gemini read off the photo. Every field is null unless visibly printed. */
export interface PosterInfo {
  kind: "event_poster" | "club_photo" | "other";
  clubName: string | null;
  eventTitle: string | null;
  dateText: string | null;
  timeText: string | null;
  location: string | null;
  summary: string | null;
  links: string[];
  socials: string[];
  emails: string[];
}

export type ScanResult =
  | { status: "ok"; info: PosterInfo; events: PulseEvent[]; clubs: Club[] }
  | { status: "unconfigured" | "error" | "busy"; message: string };

const MODEL = "google/gemini-3.8-flash";
const MAX_BYTES = 6_000_000;
// Simple per-instance brake on a public, billable endpoint.
let windowStart = 0;
let windowCount = 0;
const PER_MINUTE = 20;

const strArr = { type: "array", items: { type: "string" } };
const nStr = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "clubName", "eventTitle", "dateText", "timeText", "location", "summary", "links", "socials", "emails"],
  properties: {
    kind: { type: "string", enum: ["event_poster", "club_photo", "other"] },
    clubName: nStr, eventTitle: nStr, dateText: nStr, timeText: nStr, location: nStr, summary: nStr,
    links: strArr, socials: strArr, emails: strArr,
  },
};

const PROMPT = `You read photos of UNC Chapel Hill flyers, posters, tabling signs, and club photos.
Extract ONLY text that is visibly printed in the image. Never guess or invent a club, date, place, or link.
Use null (or an empty list) for anything not visible. "summary" is one short neutral sentence describing what the poster/photo is about, based only on what is visible.
"socials" are handles like @unc_club. "links" are URLs or QR-code captions printed as text (you cannot scan QR codes).`;

const tokens = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "unc", "club", "for", "with", "carolina"].includes(w)));
function overlap(a: string | null, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

export const scanPoster = createServerFn({ method: "POST" })
  .inputValidator((d: { image: string }) => {
    if (typeof d?.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(d.image)) throw new Error("Send a JPEG, PNG or WebP photo.");
    if (d.image.length > MAX_BYTES * 1.37) throw new Error("That photo is too large.");
    return d;
  })
  .handler(async ({ data }): Promise<ScanResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { status: "unconfigured", message: "Photo scanning isn't set up yet." };
    const now = Date.now();
    if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
    if (++windowCount > PER_MINUTE) return { status: "busy", message: "Lots of scans right now — try again in a minute." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: [{ type: "text", text: "Read this image." }, { type: "image_url", image_url: { url: data.image } }] },
        ],
        response_format: { type: "json_schema", json_schema: { name: "poster", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok) {
      const msg =
        res.status === 402 ? "AI credits have run out for this workspace." :
        res.status === 429 ? "Too many scans right now — try again shortly." :
        res.status === 403 ? "The AI provider declined this request." :
        res.status === 400 ? "That image couldn't be read. Try a clearer photo." :
        "Scanning failed. Please try again.";
      console.error("scanPoster gateway", res.status);
      return { status: "error", message: msg };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let info: PosterInfo;
    try {
      info = JSON.parse(json.choices?.[0]?.message?.content ?? "");
    } catch {
      return { status: "error", message: "Couldn't read anything from that photo." };
    }

    const [{ getFeed }, { listClubs }] = await Promise.all([import("@/modules/ingestion/importer"), import("@/modules/clubs/clubs.functions")]);
    const [feed, clubs] = await Promise.all([getFeed(), listClubs().catch(() => [] as Club[])]);
    const query = [info.clubName, info.eventTitle].filter(Boolean).join(" ") || null;
    const events = feed.events
      .map((e) => ({ e, s: Math.max(overlap(info.eventTitle, e.title), overlap(info.clubName, e.organizer), overlap(query, e.title) * 0.8) }))
      .filter((x) => x.s >= 0.5)
      .sort((a, b) => b.s - a.s || a.e.startsAt.localeCompare(b.e.startsAt))
      .slice(0, 5)
      .map((x) => x.e);
    const matchedClubs = clubs
      .map((c) => ({ c, s: overlap(info.clubName ?? query, c.name) }))
      .filter((x) => x.s >= 0.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.c);
    return { status: "ok", info, events, clubs: matchedClubs };
  });
