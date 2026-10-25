// Lexical overlap, not meaning. FEMA's duplication check is after copied text,
// and every fire department's narrative is about the same subjects, so an
// embedding comparison would flag everyone. Six-word shingles skip stock
// phrases ("self-contained breathing apparatus") but catch copied sentences.

export const SHINGLE_WORDS = 6;

export interface Token {
  word: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    tokens.push({ word: m[0].toLowerCase().replaceAll("’", "'"), start, end: start + m[0].length });
  }
  return tokens;
}

// 32-bit FNV-1a. Collisions only cost a little precision at this scale.
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shingleHashes(tokens: Token[], size = SHINGLE_WORDS): number[] {
  const hashes: number[] = [];
  for (let i = 0; i + size <= tokens.length; i++) {
    hashes.push(fnv1a(tokens.slice(i, i + size).map((t) => t.word).join(" ")));
  }
  return hashes;
}

export function uniqueShingles(text: string): number[] {
  return [...new Set(shingleHashes(tokenize(text)))];
}

export interface Span {
  start: number;
  end: number;
}

// Character ranges of the draft covered by matched shingles, merged, so the
// editor can highlight the chief's own overlapping passages.
export function overlapSpans(text: string, matched: ReadonlySet<number>, size = SHINGLE_WORDS): Span[] {
  const tokens = tokenize(text);
  const spans: Span[] = [];
  shingleHashes(tokens, size).forEach((hash, i) => {
    if (!matched.has(hash)) return;
    const start = tokens[i]!.start;
    const end = tokens[i + size - 1]!.end;
    const last = spans.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else spans.push({ start, end });
  });
  return spans;
}

export type SimilarityVerdict = "too_short" | "original" | "some_overlap" | "high_overlap";

export const MIN_SHINGLES = 10;
export const SOME_OVERLAP = 0.03;
export const HIGH_OVERLAP = 0.15;

export function verdictFor(maxContainment: number, shingleCount: number): SimilarityVerdict {
  if (shingleCount < MIN_SHINGLES) return "too_short";
  if (maxContainment >= HIGH_OVERLAP) return "high_overlap";
  if (maxContainment >= SOME_OVERLAP) return "some_overlap";
  return "original";
}

export const VERDICT_LABELS: Record<SimilarityVerdict, string> = {
  too_short: "Too short to check",
  original: "Reads as your own",
  some_overlap: "Some overlap",
  high_overlap: "High overlap",
};
