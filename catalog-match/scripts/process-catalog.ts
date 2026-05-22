/**
 * One-time preprocessing script.
 * Reads catalog.csv, runs each description through Ollama for:
 *   1. Attribute extraction  (qwen2.5:7b)
 *   2. Vector embedding      (nomic-embed-text → 768-dim)
 * Writes results to catalog_processed.csv.
 *
 * No rate limits — Ollama is local. Safe to re-run (resumes from last checkpoint).
 *
 * Usage: npm run process-catalog
 * Prerequisites: ollama serve must be running with both models pulled.
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

import { extractAttributes } from "../lib/attribute-extractor";
import { getEmbedding } from "../lib/ollama";

interface RawCatalogRow {
  catalog_id:          string;
  sku:                 string;
  catalog_description: string;
  active:              string;
}

const CATALOG_IN  = path.join(__dirname, "../../catalog.csv");
const CATALOG_OUT = path.join(__dirname, "../../catalog_processed.csv");

const OUTPUT_COLUMNS = [
  "catalog_id", "sku", "description", "active",
  "fastener_type", "drive_type", "thread_size", "length",
  "material", "grade", "finish", "standard",
  "embedding",
];

function loadAlreadyProcessed(): Set<string> {
  if (!fs.existsSync(CATALOG_OUT)) return new Set();
  try {
    const rows = parse(fs.readFileSync(CATALOG_OUT, "utf-8"), {
      columns: true, skip_empty_lines: true,
    }) as { catalog_id: string }[];
    const ids = new Set(rows.map((r) => r.catalog_id));
    if (ids.size > 0) console.log(`Resuming — ${ids.size} parts already done, skipping them.`);
    return ids;
  } catch {
    return new Set();
  }
}

async function main() {
  console.log("Reading catalog.csv...");
  const rows = parse(fs.readFileSync(CATALOG_IN, "utf-8"), {
    columns: true, skip_empty_lines: true,
  }) as RawCatalogRow[];

  const done      = loadAlreadyProcessed();
  const remaining = rows.filter((r) => !done.has(r.catalog_id));

  console.log(`Total: ${rows.length} | Remaining: ${remaining.length}\n`);

  if (remaining.length === 0) {
    console.log("All parts already processed. Nothing to do.");
    return;
  }

  // Write CSV header on fresh start
  if (done.size === 0) {
    fs.writeFileSync(
      CATALOG_OUT,
      stringify([], { header: true, columns: OUTPUT_COLUMNS }),
      "utf-8"
    );
  }

  let idx           = done.size;
  const totalDone   = done.size;
  const startTime   = Date.now();
  const rowTimes: number[] = [];

  function formatDuration(ms: number): string {
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
  }

  function renderProgress(current: number, total: number, barWidth = 30): string {
    const pct      = current / total;
    const filled   = Math.round(pct * barWidth);
    const bar      = "█".repeat(filled) + "░".repeat(barWidth - filled);
    return `[${bar}] ${current}/${total} (${Math.round(pct * 100)}%)`;
  }

  for (const row of remaining) {
    const desc     = row.catalog_description;
    const rowStart = Date.now();
    idx++;

    const completedThisRun = idx - totalDone;
    const avgMs    = rowTimes.length > 0
      ? rowTimes.reduce((a, b) => a + b, 0) / rowTimes.length
      : null;
    const etaMs    = avgMs ? avgMs * (rows.length - idx) : null;
    const elapsed  = Date.now() - startTime;

    // Progress header line
    console.log(`\n${renderProgress(idx - 1, rows.length)}`);
    if (avgMs) {
      console.log(`Elapsed: ${formatDuration(elapsed)}  |  Avg/part: ${formatDuration(avgMs)}  |  ETA: ${etaMs ? formatDuration(etaMs) : "calculating..."}`);
    }

    process.stdout.write(`Processing [${idx}/${rows.length}] ${row.catalog_id} — ${desc.slice(0, 60)}...\n`);
    process.stdout.write(`  Extracting attributes + embedding... `);

    let attrs, embedding: number[];
    try {
      [attrs, embedding] = await Promise.all([
        extractAttributes(desc),
        getEmbedding(desc),
      ]);
    } catch (err) {
      console.error(`\nError: ${(err as Error).message?.slice(0, 150)}`);
      console.error("Progress is saved — re-run to resume from here.");
      process.exit(1);
    }

    const rowMs = Date.now() - rowStart;
    rowTimes.push(rowMs);

    const outputRow: Record<string, string> = {
      catalog_id:    row.catalog_id,
      sku:           row.sku,
      description:   desc.toLowerCase(),
      active:        row.active === "Y" ? "true" : "false",
      fastener_type: attrs.fastener_type ?? "",
      drive_type:    attrs.drive_type    ?? "",
      thread_size:   attrs.thread_size   ?? "",
      length:        attrs.length        ?? "",
      material:      attrs.material      ?? "",
      grade:         attrs.grade         ?? "",
      finish:        attrs.finish        ?? "",
      standard:      attrs.standard      ?? "",
      embedding:     JSON.stringify(embedding),
    };

    // Append one row immediately so every success is checkpointed
    fs.appendFileSync(
      CATALOG_OUT,
      stringify([outputRow], { header: false, columns: OUTPUT_COLUMNS }),
      "utf-8"
    );

    console.log(`done in ${formatDuration(rowMs)}`);
    console.log(`  → ${attrs.fastener_type ?? "?"} | thread: ${attrs.thread_size ?? "?"} | material: ${attrs.material ?? "?"} | finish: ${attrs.finish ?? "?"}`);
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`✓ Complete — ${rows.length} parts written to catalog_processed.csv`);
  console.log(`  Total time : ${formatDuration(totalTime)}`);
  console.log(`  Avg / part : ${formatDuration(totalTime / remaining.length)}`);
}

main();
