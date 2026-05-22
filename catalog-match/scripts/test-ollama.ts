/**
 * Quick sanity check — tests attribute extraction and embedding on one part.
 * Run with: npx tsx scripts/test-ollama.ts
 */

import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

import { extractAttributes } from "../lib/attribute-extractor";
import { getEmbedding } from "../lib/ollama";

const TEST_DESC = "M8-1.25 X 30MM SOCKET HEAD CAP SCR STEEL BLACK OXIDE";

async function main() {
  console.log("Test description:", TEST_DESC);
  console.log("\n── Attribute extraction (qwen2.5:7b) ──────────────");

  const attrs = await extractAttributes(TEST_DESC);
  console.log(JSON.stringify(attrs, null, 2));

  console.log("\n── Embedding (nomic-embed-text) ────────────────────");
  const embedding = await getEmbedding(TEST_DESC);
  console.log(`Dimensions : ${embedding.length}`);
  console.log(`First 5    : [${embedding.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}]`);
  console.log("\nAll good — ready to run npm run process-catalog");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
