/** Server-side HTTP for source adapters: bounded time + size, no retries on auth failures. */
const UA = "PulseMatch/0.2 (UNC student hackathon project; event discovery)";
export const TIMEOUT_MS = 10_000;
export const MAX_BYTES = 8 * 1024 * 1024;

export class SourceHttpError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryAfterSeconds: number | null = null) {
    super(message);
  }
}

/** `label` is what appears in errors — never pass a URL containing a key. */
export async function boundedText(url: string, label: string, accept = "*/*"): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA, accept } });
  } catch (e) {
    throw new SourceHttpError(`${label}: request failed (${(e as Error).name === "TimeoutError" ? "timeout" : "network"})`, null);
  }
  if (!res.ok) {
    const ra = Number(res.headers.get("retry-after"));
    throw new SourceHttpError(`${label}: HTTP ${res.status}`, res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  const len = Number(res.headers.get("content-length"));
  if (len > MAX_BYTES) throw new SourceHttpError(`${label}: response too large`, res.status);
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new SourceHttpError(`${label}: response too large`, res.status);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export async function boundedJson<T>(url: string, label: string): Promise<T> {
  const text = await boundedText(url, label, "application/json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceHttpError(`${label}: malformed JSON`, null);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Only http(s) links survive. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
