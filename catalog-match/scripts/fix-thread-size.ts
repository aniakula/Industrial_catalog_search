/**
 * One-time patch: strips erroneous "#" prefix from fractional thread sizes
 * in catalog_processed_v2.csv (e.g. "#3/4-10" → "3/4-10").
 *
 * Rule: if thread_size starts with "#" AND contains "/", the "#" is a
 * hallucination. Legitimate gauge sizes (#8-32, #10-24) never contain "/".
 *
 * Run with: npx tsx scripts/fix-thread-size.ts
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const INPUT  = path.join(__dirname, "../../catalog_processed_v2.csv");
const OUTPUT = path.join(__dirname, "../../catalog_processed_v3.csv");

const raw  = fs.readFileSync(INPUT, "utf-8");
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

let patched = 0;

for (const row of rows) {
  const t = row.thread_size;
  if (t && t.startsWith("#") && t.includes("/")) {
    row.thread_size = t.slice(1); // strip the leading "#"
    patched++;
  }
}

const headers = Object.keys(rows[0]);
const output  = stringify(rows, { header: true, columns: headers });
fs.writeFileSync(OUTPUT, output, "utf-8");

console.log(`\nDone.`);
console.log(`  Patched : ${patched} rows`);
console.log(`  Written : ${OUTPUT}`);
console.log(`\nNext step: re-run upload-catalog to sync changes to Supabase.`);
