/** Server-only helpers for clubs. Never import from client code. */
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Constant-time compare for the agent bearer token. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Returns null when authorized, or a Response to send back. */
export function checkAgentAuth(request: Request): Response | null {
  const expected = process.env["PHOTON_AGENT_TOKEN"];
  if (!expected) return Response.json({ status: "unconfigured", error: "PHOTON_AGENT_TOKEN is not set" }, { status: 503 });
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!got || !safeEqual(got, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export function normalizePhone(p: string): string {
  const t = p.trim();
  return t.startsWith("+") ? "+" + t.slice(1).replace(/\D/g, "") : t.replace(/[^\w@.+-]/g, "");
}
