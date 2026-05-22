/**
 * One-time patch:
 * Replace processed description text with original catalog_description text
 * from catalog.csv, row-by-row (same order), while keeping every other
 * processed field exactly the same.
 *
 * Input:
 *   - ../../catalog.csv
 *   - ../../catalog_processed_v4.csv
 * Output:
 *   - ../../catalog_processed_v5.csv
 *
 * Run:
 *   npx tsx scripts/fix-description-casing.ts
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const CATALOG_RAW_PATH = path.join(__dirname, "../../catalog.csv");
const PROCESSED_V4_PATH = path.join(__dirname, "../../catalog_processed_v4.csv");
const OUTPUT_V5_PATH = path.join(__dirname, "../../catalog_processed_v5.csv");

type RawCatalogRow = {
  catalog_id: string;
  sku: string;
  catalog_description: string;
  active: string;
};

type ProcessedRow = Record<string, string>;

function parseCsv<T>(filePath: string): T[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true }) as T[];
}

function main() {
  const sourceRows = parseCsv<RawCatalogRow>(CATALOG_RAW_PATH);
  const processedRows = parseCsv<ProcessedRow>(PROCESSED_V4_PATH);

  if (sourceRows.length !== processedRows.length) {
    throw new Error(
      `Row count mismatch: catalog.csv=${sourceRows.length}, catalog_processed_v4.csv=${processedRows.length}`,
    );
  }

  let replaced = 0;
  for (let i = 0; i < processedRows.length; i++) {
    const src = sourceRows[i];
    const dst = processedRows[i];

    if (src.catalog_id !== dst.catalog_id) {
      throw new Error(
        `catalog_id mismatch at row ${i + 2}: source=${src.catalog_id}, processed=${dst.catalog_id}`,
      );
    }
    if (src.sku !== dst.sku) {
      throw new Error(
        `sku mismatch at row ${i + 2}: source=${src.sku}, processed=${dst.sku}`,
      );
    }

    if (dst.description !== src.catalog_description) {
      dst.description = src.catalog_description;
      replaced++;
    }
  }

  const headers = Object.keys(processedRows[0] ?? {});
  const output = stringify(processedRows, { header: true, columns: headers });
  fs.writeFileSync(OUTPUT_V5_PATH, output, "utf-8");

  console.log("\nDone.");
  console.log(`  Source rows: ${sourceRows.length}`);
  console.log(`  Descriptions replaced: ${replaced}`);
  console.log(`  Written: ${OUTPUT_V5_PATH}`);
}

main();
