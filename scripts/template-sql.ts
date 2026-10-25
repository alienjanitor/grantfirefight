// Adds a known template (a sample narrative that circulates among
// departments) to the similarity guard, so drafts that lean on it get flagged.
//
//   node scripts/template-sql.ts path/to/template.txt "IAFF FY22 AFG narrative template" > template.sql
//   npx wrangler d1 execute grantfirefight --remote --file template.sql
//
// Only hashes are stored, never the template text.
import { readFileSync } from "node:fs";
import { uniqueShingles } from "../src/domain/similarity.ts";

const [file, label] = process.argv.slice(2);
if (!file || !label) {
  console.error('Usage: node scripts/template-sql.ts <file> "<label>"');
  process.exit(1);
}

const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const id = `tpl:${slug}`;
const hashes = uniqueShingles(readFileSync(file, "utf8"));
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

console.log(
  [
    `INSERT INTO similarity_sources (id, kind, department_id, label, shingle_count) VALUES (${q(id)}, 'template', NULL, ${q(label)}, ${hashes.length})`,
    `  ON CONFLICT(id) DO UPDATE SET label = excluded.label, shingle_count = excluded.shingle_count, updated_at = datetime('now');`,
    `DELETE FROM shingles WHERE source_id = ${q(id)};`,
    `INSERT INTO shingles (source_id, hash) SELECT ${q(id)}, value FROM json_each(${q(JSON.stringify(hashes))});`,
  ].join("\n"),
);
console.error(`${label}: ${hashes.length} shingles`);
