/**
 * One-time script: reads catalog_processed.csv and order_history.csv,
 * upserts all rows into Supabase.
 *
 * Run AFTER process-catalog.ts completes.
 * Run with: npx tsx scripts/upload-catalog.ts
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY in .env.local
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATALOG_PROCESSED = path.join(__dirname, "../../catalog_processed.csv");
const ORDER_HISTORY     = path.join(__dirname, "../../order_history.csv");

const BATCH_SIZE = 50;

async function uploadCatalog() {
  console.log("Reading catalog_processed.csv...");
  const raw  = fs.readFileSync(CATALOG_PROCESSED, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  const parts = (rows as Record<string, string>[]).map((r) => ({
    catalog_id:    r.catalog_id,
    sku:           r.sku,
    description:   r.description,
    active:        r.active === "true",
    fastener_type: r.fastener_type || null,
    drive_type:    r.drive_type    || null,
    thread_size:   r.thread_size   || null,
    length:        r.length        || null,
    material:      r.material      || null,
    grade:         r.grade         || null,
    finish:        r.finish        || null,
    standard:      r.standard      || null,
    embedding:     r.embedding     ? JSON.parse(r.embedding) : null,
  }));

  console.log(`Uploading ${parts.length} catalog parts in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < parts.length; i += BATCH_SIZE) {
    const batch = parts.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("catalog_parts")
      .upsert(batch, { onConflict: "catalog_id" });

    if (error) {
      console.error(`Batch ${i}-${i + BATCH_SIZE} error:`, error);
      process.exit(1);
    }
    console.log(`Uploaded parts ${i + 1}–${Math.min(i + BATCH_SIZE, parts.length)}`);
  }

  console.log("Catalog upload complete.");
}

async function uploadOrderHistory() {
  console.log("\nReading order_history.csv...");
  const raw  = fs.readFileSync(ORDER_HISTORY, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  const orders = (rows as Record<string, string>[]).map((r) => ({
    customer_id:   r.customer_id,
    customer_name: r.customer_name,
    order_date:    r.order_date,
    sku:           r.sku,
    description:   r.catalog_description.toLowerCase(),
    quantity:      parseInt(r.quantity, 10),
  }));

  console.log(`Uploading ${orders.length} order history rows...`);

  const { error } = await supabase.from("order_history").insert(orders);
  if (error) {
    console.error("Order history upload error:", error);
    process.exit(1);
  }

  console.log("Order history upload complete.");
}

async function main() {
  await uploadCatalog();
  await uploadOrderHistory();
  console.log("\nAll uploads complete.");
}

main();
