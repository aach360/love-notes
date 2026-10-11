import type { BanditState, PulseEvent } from "@/shared/types";
import { TOPICS } from "@/shared/taxonomy";
import { REC_CONFIG as C } from "./config";
import { normalize, project, projectionMatrix } from "./vectors";

/** One dedicated dimension per taxonomy topic — no hash collisions, fully interpretable. */
const TOPIC_INDEX = new Map(TOPICS.map((t, i) => [t.id, i]));
const TOPIC_DIMS = TOPICS.length;

/**
 * Per-user LinUCB (Li et al., 2010) over a compact feature vector.
 * We store ridge statistics A (= λI + Σxxᵀ) and b (= Σ r·x) and solve with a Cholesky
 * factorization each ranking pass — O(d³) with d = 37, numerically stable, no explicit inverse.
 * Output is a ranking score, not a calibrated probability.
 */
export const BANDIT_DIMS = C.banditSemanticDims + TOPIC_DIMS + 4 + 1;

let P: Float64Array | null = null;
const proj = () => (P ??= projectionMatrix(C.banditSemanticDims, C.semanticDims, 0x5eed));

export function emptyBandit(): BanditState {
  const d = BANDIT_DIMS;
  const A = new Array<number>(d * d).fill(0);
  for (let i = 0; i < d; i++) A[i * d + i] = C.lambda;
  return { version: C.featureVersion, d, A, b: new Array<number>(d).fill(0), n: 0 };
}

/** Valid, current-version state or a fresh one (version migration = reset; likes/saves are untouched). */
export function ensureBandit(s: BanditState | undefined | null): BanditState {
  const d = BANDIT_DIMS;
  if (!s || s.version !== C.featureVersion || s.d !== d || s.A?.length !== d * d || s.b?.length !== d) return emptyBandit();
  if (![...s.A, ...s.b].every(Number.isFinite)) return emptyBandit();
  return s;
}

/** Bounded context features in [0,1]. */
function contextFeatures(e: PulseEvent, now: Date): number[] {
  const start = new Date(e.startsAt);
  const hours = Math.max(0, (start.getTime() - now.getTime()) / 3_600_000);
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(start));
  const nyDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(start);
  return [1 / (1 + hours / 48), nyDay === "Sat" || nyDay === "Sun" ? 1 : 0, !e.allDay && nyHour >= 17 ? 1 : 0, e.allDay ? 1 : 0];
}

/** x = [proj24(semantic) | one-hot taxonomy topics | 4 context | 1]. Semantic block is zeros when missing. */
export function banditFeatures(e: PulseEvent, semantic: number[] | null | undefined, now: Date): number[] {
  const sem = semantic ? normalize(project(proj(), C.banditSemanticDims, semantic)) : null;
  const topics = new Array<number>(TOPIC_DIMS).fill(0);
  for (const t of e.topics ?? []) {
    const i = TOPIC_INDEX.get(t);
    if (i !== undefined) topics[i] = 1;
  }
  const x = [
    ...(sem ?? new Array<number>(C.banditSemanticDims).fill(0)),
    ...topics,
    ...contextFeatures(e, now).map((v) => v * 0.5),
    0.5,
  ];
  return x.map((v) => Math.round(v * 1e4) / 1e4);
}

/** A ← A + xxᵀ, b ← b + r·x. r = 1 like, 0 pass. Ignores malformed x. */
export function updateBandit(state: BanditState, x: number[], reward: 0 | 1): BanditState {
  const s = ensureBandit(state);
  const d = s.d;
  if (x.length !== d || !x.every(Number.isFinite)) return s;
  const A = s.A.slice();
  const b = s.b.slice();
  for (let i = 0; i < d; i++) {
    b[i]! += reward * x[i]!;
    for (let j = 0; j < d; j++) A[i * d + j]! += x[i]! * x[j]!;
  }
  return { ...s, A, b, n: s.n + 1 };
}

/** Cholesky A = LLᵀ (lower, row-major). Adds jitter if A drifts from positive definite. */
export function cholesky(A: number[], d: number): Float64Array {
  for (let attempt = 0; attempt < 4; attempt++) {
    const jitter = attempt ? 1e-8 * 10 ** (attempt * 2) : 0;
    const L = new Float64Array(d * d);
    let ok = true;
    for (let i = 0; i < d && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i * d + j]! + (i === j ? jitter : 0);
        for (let k = 0; k < j; k++) s -= L[i * d + k]! * L[j * d + k]!;
        if (i === j) {
          if (!(s > 1e-12)) {
            ok = false;
            break;
          }
          L[i * d + i] = Math.sqrt(s);
        } else L[i * d + j] = s / L[j * d + j]!;
      }
    }
    if (ok) return L;
  }
  throw new Error("bandit: matrix not positive definite");
}

function forward(L: Float64Array, d: number, v: ArrayLike<number>): Float64Array {
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = v[i]!;
    for (let k = 0; k < i; k++) s -= L[i * d + k]! * y[k]!;
    y[i] = s / L[i * d + i]!;
  }
  return y;
}
function backward(L: Float64Array, d: number, y: Float64Array): Float64Array {
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < d; k++) s -= L[k * d + i]! * x[k]!;
    x[i] = s / L[i * d + i]!;
  }
  return x;
}

export interface BanditModel {
  /** θᵀx */
  predict(x: number[]): number;
  /** sqrt(xᵀA⁻¹x) */
  uncertainty(x: number[]): number;
  theta: Float64Array;
  n: number;
}

export function banditModel(state: BanditState | undefined | null): BanditModel {
  const s = ensureBandit(state);
  const L = cholesky(s.A, s.d);
  const theta = backward(L, s.d, forward(L, s.d, s.b));
  return {
    theta,
    n: s.n,
    predict: (x) => {
      let p = 0;
      for (let i = 0; i < s.d; i++) p += theta[i]! * (x[i] ?? 0);
      return Number.isFinite(p) ? p : 0;
    },
    uncertainty: (x) => {
      const y = forward(L, s.d, x);
      let q = 0;
      for (let i = 0; i < s.d; i++) q += y[i]! * y[i]!;
      return Number.isFinite(q) ? Math.sqrt(q) : 0;
    },
  };
}
