/**
 * One-time patch: fills in null fastener_type values in catalog_processed.csv
 * by mapping SKU prefix → fastener type.
 *
 * Run with: npx tsx scripts/fix-fastener-types.ts
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const CATALOG_FILE    = path.join(__dirname, "../../catalog_processed.csv");
const CATALOG_FILE_V2 = path.join(__dirname, "../../catalog_processed_v2.csv");

// ---------------------------------------------------------------------------
// SKU prefix → fastener type mapping
// Prefixes are matched from the start of the SKU (case-insensitive).
// Order matters: more specific prefixes first.
// ---------------------------------------------------------------------------
const SKU_FASTENER_MAP: { prefix: string; type: string }[] = [
  { prefix: "PXWASH",  type: "flat washer"  },
  { prefix: "PXLOCK",  type: "lock washer"  },
  { prefix: "PXROD",   type: "threaded rod" },
  { prefix: "PXNUT",   type: "hex nut"      },
  { prefix: "PXHEX",   type: "hex cap screw"              },
  { prefix: "PXLAG",   type: "lag screw"                  },
  { prefix: "PXSOC",   type: "socket head cap screw"      },
  { prefix: "PXBTN",   type: "button socket cap screw"    },
  { prefix: "PXPAN",   type: "phillips pan machine screw" },
  { prefix: "PXTAP",   type: "tap bolt"                   },
];

function fastenerTypeFromSku(sku: string): string | null {
  const upper = sku.toUpperCase();
  for (const { prefix, type } of SKU_FASTENER_MAP) {
    if (upper.startsWith(prefix)) return type;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const raw  = fs.readFileSync(CATALOG_FILE, "utf-8");
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

let patched = 0;
let skipped = 0;

for (const row of rows) {
  if (!row.fastener_type) {
    const mapped = fastenerTypeFromSku(row.sku);
    if (mapped) {
      row.fastener_type = mapped;
      patched++;
    } else {
      console.warn(`  ⚠ No mapping for SKU: ${row.sku}`);
      skipped++;
    }
  }
}

// Write to new file with the same column order
const headers = Object.keys(rows[0]);
const output  = stringify(rows, { header: true, columns: headers });
fs.writeFileSync(CATALOG_FILE_V2, output, "utf-8");

console.log(`\nDone.`);
console.log(`  Patched : ${patched} rows`);
console.log(`  Skipped : ${skipped} rows (no SKU mapping found)`);
console.log(`  Written : ${CATALOG_FILE_V2}`);
console.log(`\nNext step: re-run upload-catalog to sync changes to Supabase.`);
