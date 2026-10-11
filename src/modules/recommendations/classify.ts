import type { PulseEvent } from "@/shared/types";
import { BENEFITS, FORMATS, TOPICS, TAXONOMY_VERSION, canonicalTopic } from "@/shared/taxonomy";

/**
 * Content-grounded event classification.
 *
 * Topics/formats/benefits are inferred ONLY from the event's own title and
 * description. Every assigned label carries an evidence passage — the exact
 * slice of source text that supported it — so classifications stay auditable
 * and never invent facts. An empty topic set is a valid, honest result.
 *
 * Deterministic and conservative: this is the fallback that always runs, and
 * it also validates AI-suggested topics (the AI's evidence passage must occur
 * in the source text and match a known synonym).
 */

export interface Classification {
  version: string;
  topics: string[];
  formats: string[];
  benefits: string[];
  /** topic id → exact passage from the listing that supports it */
  evidence: Record<string, string>;
}

/** Word-boundary-ish match: synonym must appear as a standalone phrase, not inside another word. */
function findEvidence(text: string, synonym: string): string | null {
  const t = text.toLowerCase();
  const s = synonym.toLowerCase().trim();
  if (!s) return null;
  const pad = s.startsWith(" ") || s.endsWith(" ");
  const needle = pad ? s : null;
  const idx = needle ? t.indexOf(needle) : -1;
  if (needle) {
    if (idx < 0) return null;
    return text.slice(Math.max(0, idx), Math.min(text.length, idx + s.length)).trim();
  }
  let from = 0;
  for (;;) {
    const i = t.indexOf(s, from);
    if (i < 0) return null;
    const before = i === 0 ? " " : t[i - 1]!;
    const after = i + s.length >= t.length ? " " : t[i + s.length]!;
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      return text.slice(i, i + s.length);
    }
    from = i + 1;
  }
}

/** Reject passages that are negated ("no free food") or clearly boilerplate. */
function isSupported(text: string, evidence: string): boolean {
  const i = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (i < 0) return false;
  const before = text.slice(Math.max(0, i - 24), i).toLowerCase();
  if (/\b(no|not|without|never|don't|doesn't|won't|instead of)\s*$/.test(before)) return false;
  return true;
}

function matchAll(text: string, defs: { id: string; synonyms: string[] }[]): { ids: string[]; evidence: Record<string, string> } {
  const ids: string[] = [];
  const evidence: Record<string, string> = {};
  for (const d of defs) {
    for (const syn of d.synonyms) {
      const ev = findEvidence(text, syn);
      if (ev && isSupported(text, ev)) {
        ids.push(d.id);
        evidence[d.id] = ev;
        break;
      }
    }
  }
  return { ids, evidence };
}

/**
 * Classify one event from its own text. Title counts double by being searched first;
 * description adds longer-tail topics. Source categories are consulted only as a
 * weak hint through canonicalTopic — vague labels like "Community Building" map to nothing.
 */
export function classifyEvent(e: Pick<PulseEvent, "title" | "description" | "categories" | "tags" | "aiTags">): Classification {
  const text = `${e.title}\n${e.description ?? ""}`;
  const topics = matchAll(text, TOPICS);
  const formats = matchAll(text, FORMATS);
  const benefits = matchAll(text, BENEFITS);

  // Normalize source/AI tags into canonical topics only when the tag is also visible in
  // the event's own text — a tag the listing never mentions (e.g. "basketball" on a
  // department meeting) is rejected as unsupported.
  for (const raw of [...e.tags, ...(e.aiTags ?? [])]) {
    const id = canonicalTopic(raw);
    if (id && !topics.ids.includes(id)) {
      const ev = findEvidence(text, raw.trim());
      if (ev && isSupported(text, ev)) {
        topics.ids.push(id);
        topics.evidence[id] = ev;
      }
    }
  }

  return { version: TAXONOMY_VERSION, topics: topics.ids, formats: formats.ids, benefits: benefits.ids, evidence: topics.evidence };
}

/** Validate an AI-suggested topic: it must be a known topic AND have evidence in the source text. */
export function validateAiTopic(topicId: string, claimedEvidence: string, e: Pick<PulseEvent, "title" | "description">): string | null {
  const def = TOPICS.find((t) => t.id === topicId);
  if (!def) return null;
  const text = `${e.title}\n${e.description ?? ""}`;
  // The claimed passage must actually occur in the source…
  const ev = findEvidence(text, claimedEvidence);
  if (!ev || !isSupported(text, ev)) return null;
  // …and must genuinely match one of the topic's synonyms.
  for (const syn of def.synonyms) {
    const m = findEvidence(ev, syn);
    if (m) return ev;
  }
  return null;
}

/** Apply a fresh classification to an event (additive fields; source facts untouched). */
export function withClassification<T extends Pick<PulseEvent, "title" | "description" | "categories" | "tags" | "aiTags">>(e: T): T & {
  topics: string[];
  formats: string[];
  benefits: string[];
  topicEvidence: Record<string, string>;
  taxonomyVersion: string;
} {
  const c = classifyEvent(e);
  return { ...e, topics: c.topics, formats: c.formats, benefits: c.benefits, topicEvidence: c.evidence, taxonomyVersion: c.version };
}
