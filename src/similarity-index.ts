import { MIN_SHINGLES, overlapSpans, uniqueShingles, verdictFor, type SimilarityVerdict, type Span } from "./domain/similarity";

// Hashes travel as one JSON parameter and unpack with json_each, so indexing
// or checking a draft is one statement however long it is. That keeps a save
// well inside D1's per-invocation query limit and its 100-parameter cap.

export async function indexText(
  db: D1Database,
  sourceId: string,
  kind: "section" | "template",
  departmentId: string | null,
  label: string,
  text: string,
) {
  const hashes = uniqueShingles(text);
  await db.batch([
    db
      .prepare(
        `INSERT INTO similarity_sources (id, kind, department_id, label, shingle_count, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET label = excluded.label, shingle_count = excluded.shingle_count, updated_at = excluded.updated_at`,
      )
      .bind(sourceId, kind, departmentId, label, hashes.length),
    db.prepare("DELETE FROM shingles WHERE source_id = ?").bind(sourceId),
    db.prepare("INSERT INTO shingles (source_id, hash) SELECT ?, value FROM json_each(?)").bind(sourceId, JSON.stringify(hashes)),
  ]);
}

export interface OverlapSource {
  // Templates are named. Other departments' drafts never are.
  label: string;
  containment: number;
}

export interface SimilarityResult {
  verdict: SimilarityVerdict;
  // Share of the draft found in the single closest source.
  maxContainment: number;
  // Share of the draft found anywhere.
  overall: number;
  shingles: number;
  sources: OverlapSource[];
  spans: Span[];
}

// Compares a draft against every other department's drafts and every known
// template. The department's own drafts don't count against it.
export async function checkText(db: D1Database, departmentId: string, text: string): Promise<SimilarityResult> {
  const hashes = uniqueShingles(text);
  if (hashes.length < MIN_SHINGLES) {
    return { verdict: verdictFor(0, hashes.length), maxContainment: 0, overall: 0, shingles: hashes.length, sources: [], spans: [] };
  }

  const { results } = await db
    .prepare(
      `SELECT sh.source_id, sh.hash, src.kind, src.label
       FROM shingles sh JOIN similarity_sources src ON src.id = sh.source_id
       WHERE sh.hash IN (SELECT value FROM json_each(?))
         AND (src.department_id IS NULL OR src.department_id != ?)`,
    )
    .bind(JSON.stringify(hashes), departmentId)
    .all<{ source_id: string; hash: number; kind: string; label: string }>();

  const perSource = new Map<string, { kind: string; label: string; hits: number }>();
  const matched = new Set<number>();
  for (const row of results) {
    matched.add(row.hash);
    const entry = perSource.get(row.source_id) ?? { kind: row.kind, label: row.label, hits: 0 };
    entry.hits++;
    perSource.set(row.source_id, entry);
  }

  const ranked = [...perSource.values()].sort((a, b) => b.hits - a.hits);
  const maxContainment = (ranked[0]?.hits ?? 0) / hashes.length;
  return {
    verdict: verdictFor(maxContainment, hashes.length),
    maxContainment,
    overall: matched.size / hashes.length,
    shingles: hashes.length,
    sources: ranked.slice(0, 3).map((s) => ({
      label: s.kind === "template" ? `Known template: ${s.label}` : "Another department's draft",
      containment: s.hits / hashes.length,
    })),
    spans: overlapSpans(text, matched),
  };
}
