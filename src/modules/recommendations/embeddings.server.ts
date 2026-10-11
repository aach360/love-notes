import type { PulseEvent } from "@/shared/types";
import { REC_CONFIG as C } from "./config";
import { embeddingText, fnv, normalize, project, projectionMatrix } from "./vectors";

/**
 * Server-only embedding service (Lovable AI Gateway, OpenAI-compatible /v1/embeddings).
 * Full vectors are reduced server-side with a fixed seeded random projection to 64 dims
 * (cosine is approximately preserved) so the browser payload stays small.
 * Cache: in-memory, keyed by model + projection version + hash of the input text.
 * It does NOT survive a server restart / new edge instance.
 */
export const EMBED_MODEL = "google/gemini-embedding-2";
export const EMBED_VERSION = `p${C.semanticDims}-v1`;
const URL_ = "https://ai.gateway.lovable.dev/v1/embeddings";
const BATCH = 32;
const MAX_PER_CALL = 128;
const BUDGET_MS = 9000;

const cache = new Map<string, number[]>();
let projByDim: { dim: number; m: Float64Array } | null = null;
/** Paused after a credit/permission failure for this instance — never hammer a blocked account. */
let blocked: string | null = null;

const keyFor = (text: string) => `${EMBED_MODEL}|${EMBED_VERSION}|${fnv(text).toString(16)}|${text.length}`;

function reduce(full: number[]): number[] | null {
  if (!projByDim || projByDim.dim !== full.length) projByDim = { dim: full.length, m: projectionMatrix(C.semanticDims, full.length, 0xe5bed) };
  const u = normalize(full);
  if (!u) return null;
  const r = normalize(project(projByDim.m, C.semanticDims, u));
  return r ? r.map((v) => Math.round(v * 1000) / 1000) : null;
}

export class EmbedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function embedBatch(texts: string[], apiKey: string): Promise<(number[] | null)[]> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new EmbedError(`embeddings HTTP ${res.status}: ${body}`, res.status);
  }
  const j = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const out: (number[] | null)[] = texts.map(() => null);
  for (const d of j.data ?? []) if (Array.isArray(d.embedding) && d.index >= 0 && d.index < texts.length) out[d.index] = reduce(d.embedding);
  return out;
}

export interface VectorResult {
  status: "ok" | "partial" | "unconfigured" | "error";
  model: string;
  version: string;
  vectors: Record<string, number[]>;
  missing: number;
  error: string | null;
}

export async function vectorsFor(events: PulseEvent[], embed: typeof embedBatch = embedBatch): Promise<VectorResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const base = { model: EMBED_MODEL, version: EMBED_VERSION };
  const real = events.filter((e) => !e.isDemo);
  const texts = new Map(real.map((e) => [e.id, embeddingText(e)]));
  const vectors: Record<string, number[]> = {};
  const todo: { id: string; text: string }[] = [];
  for (const [id, text] of texts) {
    const hit = cache.get(keyFor(text));
    if (hit) vectors[id] = hit;
    else todo.push({ id, text });
  }
  if (!apiKey) return { ...base, status: "unconfigured", vectors, missing: todo.length, error: null };
  if (blocked) return { ...base, status: "error", vectors, missing: todo.length, error: blocked };

  const deadline = Date.now() + BUDGET_MS;
  let error: string | null = null;
  const work = todo.slice(0, MAX_PER_CALL);
  for (let i = 0; i < work.length && Date.now() < deadline; i += BATCH) {
    const chunk = work.slice(i, i + BATCH);
    try {
      const vs = await embed(chunk.map((c) => c.text), apiKey);
      chunk.forEach((c, k) => {
        const v = vs[k];
        if (v) {
          cache.set(keyFor(c.text), v);
          vectors[c.id] = v;
        }
      });
    } catch (e) {
      error = (e as Error).message;
      if (e instanceof EmbedError && [401, 402, 403].includes(e.status)) blocked = error;
      break; // no immediate retry; next feed load tries again
    }
  }
  const missing = real.length - Object.keys(vectors).length;
  return { ...base, status: error && !Object.keys(vectors).length ? "error" : missing ? "partial" : "ok", vectors, missing, error };
}
