import type { PulseEvent } from "@/shared/types";

/** Small, dependency-free vector math shared by the client engine and the server embedding service. */

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export const norm = (a: ArrayLike<number>) => Math.sqrt(dot(a, a));

/** Returns a unit vector, or null for zero / non-finite input. */
export function normalize(a: ArrayLike<number>): number[] | null {
  const n = norm(a);
  if (!Number.isFinite(n) || n < 1e-12) return null;
  return Array.from(a, (x) => x / n);
}

/** Cosine similarity; 0 when either side is missing or zero. */
export function cosine(a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined): number {
  if (!a || !b) return 0;
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-12 || nb < 1e-12) return 0;
  const c = dot(a, b) / (na * nb);
  return Number.isFinite(c) ? Math.max(-1, Math.min(1, c)) : 0;
}

/** Weighted mean of vectors, normalized. Null when nothing usable. */
export function meanVector(vs: { v: ArrayLike<number>; w: number }[], dims: number): number[] | null {
  if (!vs.length) return null;
  const acc = new Array<number>(dims).fill(0);
  for (const { v, w } of vs) for (let i = 0; i < dims; i++) acc[i]! += (v[i] ?? 0) * w;
  return normalize(acc);
}

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed, seeded ±1/√rows random projection (Achlioptas). rows × cols, row-major. */
export function projectionMatrix(rows: number, cols: number, seed: number): Float64Array {
  const rnd = mulberry32(seed);
  const m = new Float64Array(rows * cols);
  const s = 1 / Math.sqrt(rows);
  for (let i = 0; i < m.length; i++) m[i] = rnd() < 0.5 ? -s : s;
  return m;
}

export function project(m: Float64Array, rows: number, v: ArrayLike<number>): number[] {
  const cols = v.length;
  const out = new Array<number>(rows).fill(0);
  for (let r = 0; r < rows; r++) {
    let s = 0;
    const off = r * cols;
    for (let c = 0; c < cols; c++) s += m[off + c]! * v[c]!;
    out[r] = s;
  }
  return out;
}

export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Labels used for the non-semantic fallback (deduped). Taxonomy topics lead; raw source labels follow. */
export function eventLabels(e: Pick<PulseEvent, "categories" | "tags" | "aiTags" | "topics" | "formats" | "benefits">): string[] {
  return [...new Set([
    ...(e.topics ?? []).map((t) => `topic:${t}`),
    ...(e.formats ?? []).map((f) => `fmt:${f}`),
    ...(e.benefits ?? []).map((b) => `ben:${b}`),
    ...e.categories.map((c) => `cat:${c.trim().toLowerCase()}`),
    ...[...e.tags, ...(e.aiTags ?? [])].map((t) => `tag:${t.trim().toLowerCase()}`),
  ])].filter((k) => k.length > 4);
}

/** Signed feature hashing of labels into `dims` buckets — the "tag-fallback" representation. */
export function hashedLabelVector(labels: string[], dims: number): number[] | null {
  const v = new Array<number>(dims).fill(0);
  for (const k of labels) {
    const h = fnv(k);
    v[h % dims]! += (h & 0x80000000 ? -1 : 1) * (k.startsWith("cat:") ? 1 : 0.7);
  }
  return normalize(v);
}

/** Semantic content only — no ids, source names or image URLs. */
export function embeddingText(e: Pick<PulseEvent, "title" | "description" | "categories" | "aiTags">): string {
  return [
    e.title,
    (e.description ?? "").slice(0, 1500),
    e.categories.length ? `Categories: ${e.categories.join(", ")}` : "",
    e.aiTags?.length ? `Topics: ${e.aiTags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
