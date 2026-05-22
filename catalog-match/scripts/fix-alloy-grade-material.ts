/**
 * One-time patch:
 * If material is empty AND grade is "alloy", move "alloy" to material
 * and clear grade.
 *
 * Input:  ../../catalog_processed_v3.csv
 * Output: ../../catalog_processed_v4.csv
 *
 * Run with:
 *   npx tsx scripts/fix-alloy-grade-material.ts
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const INPUT = path.join(__dirname, "../../catalog_processed_v3.csv");
const OUTPUT = path.join(__dirname, "../../catalog_processed_v4.csv");

const raw = fs.readFileSync(INPUT, "utf-8");
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

let patched = 0;

for (const row of rows) {
  const material = (row.material ?? "").trim().toLowerCase();
  const grade = (row.grade ?? "").trim().toLowerCase();

  if (!material && grade === "alloy") {
    row.material = "alloy";
    row.grade = "";
    patched++;
  }
}

const headers = Object.keys(rows[0] ?? {});
const output = stringify(rows, { header: true, columns: headers });
fs.writeFileSync(OUTPUT, output, "utf-8");

console.log("\nDone.");
console.log(`  Patched : ${patched} rows`);
console.log(`  Input   : ${INPUT}`);
console.log(`  Output  : ${OUTPUT}`);
