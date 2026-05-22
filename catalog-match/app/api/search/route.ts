import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase } from "@/lib/supabase";
import { extractAttributes } from "@/lib/attribute-extractor";
import { getEmbedding } from "@/lib/ollama";
import { rankParts, recomputeConfidence } from "@/lib/matcher";
import { routeQuery } from "@/lib/query-router";
import type { CatalogPart, PartAttributes, SearchRequest, SearchResponse, SearchResult } from "@/lib/types";

const CSV_PATH = path.join(process.cwd(), "..", "query_tests.csv");
const HISTORY_BOOST_MAX = 0.25; // max +25% score lift for most recent matching part
const HISTORY_BOOST_TOP_N = 20;

const CSV_HEADERS = [
  "timestamp",
  "query",
  "fastener_type",
  "thread_size",
  "length",
  "material",
  "grade",
  "finish",
  "standard",
  "top1_id",
  "top1_score",
  "top1_confidence",
  "top2_id",
  "top2_score",
  "top3_id",
  "top3_score",
];

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function logAndRecord(
  query: string,
  attrs: PartAttributes,
  top3: { catalog_id: string; final_score: number; confidence: number }[],
) {
  // ── Console log ──────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────");
  console.log(`[search] query: "${query}"`);
  console.log("  extracted attributes:");
  for (const [key, val] of Object.entries(attrs)) {
    const display = val ?? "null";
    console.log(`    ${key.padEnd(14)}: ${display}`);
  }
  if (top3.length > 0) {
    console.log("  top results:");
    top3.forEach((r, i) => {
      console.log(
        `    #${i + 1} ${r.catalog_id}  score=${r.final_score.toFixed(3)}  confidence=${r.confidence.toFixed(3)}`,
      );
    });
  }
  console.log("─────────────────────────────────────────\n");

  // ── CSV append ────────────────────────────────────────────────────────────
  const needsHeader = !fs.existsSync(CSV_PATH);
  if (needsHeader) {
    fs.writeFileSync(CSV_PATH, CSV_HEADERS.join(",") + "\n", "utf8");
  }

  const row = [
    new Date().toISOString(),
    escapeCSV(query),
    escapeCSV(attrs.fastener_type),
    escapeCSV(attrs.thread_size),
    escapeCSV(attrs.length),
    escapeCSV(attrs.material),
    escapeCSV(attrs.grade),
    escapeCSV(attrs.finish),
    escapeCSV(attrs.standard),
    escapeCSV(top3[0]?.catalog_id),
    top3[0]?.final_score.toFixed(4) ?? "",
    top3[0]?.confidence.toFixed(4) ?? "",
    escapeCSV(top3[1]?.catalog_id),
    top3[1]?.final_score.toFixed(4) ?? "",
    escapeCSV(top3[2]?.catalog_id),
    top3[2]?.final_score.toFixed(4) ?? "",
  ];

  fs.appendFileSync(CSV_PATH, row.join(",") + "\n", "utf8");
}

async function fetchRecentCustomerSkuWeights(customerId: string): Promise<{
  skuWeight: Map<string, number>;
  historyDepthFactor: number;
  recentCount: number;
}> {
  const { data, error } = await supabase
    .from("order_history")
    .select("sku, order_date")
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false })
    .limit(10);

  if (error || !data) {
    return { skuWeight: new Map<string, number>(), historyDepthFactor: 0, recentCount: 0 };
  }

  const recentCount = data.length;
  const historyDepthFactor = Math.min(recentCount / 10, 1);
  const skuWeight = new Map<string, number>();

  data.forEach((row, idx) => {
    // Most recent row gets 1.0, tenth gets 0.1
    const recencyWeight = (10 - idx) / 10;
    const prev = skuWeight.get(row.sku) ?? 0;
    if (recencyWeight > prev) skuWeight.set(row.sku, recencyWeight);
  });

  return { skuWeight, historyDepthFactor, recentCount };
}

function applyRecentHistoryBoost(
  ranked: SearchResult[],
  skuWeight: Map<string, number>,
  historyDepthFactor: number,
): SearchResult[] {
  if (skuWeight.size === 0 || historyDepthFactor <= 0) return ranked;

  const boosted = ranked.map((r) => ({ ...r }));
  const topN = Math.min(HISTORY_BOOST_TOP_N, boosted.length);
  let boostedCount = 0;

  for (let i = 0; i < topN; i++) {
    const recencyWeight = skuWeight.get(boosted[i].sku);
    if (!recencyWeight) continue;
    const before = boosted[i].final_score;
    const multiplier = 1 + HISTORY_BOOST_MAX * historyDepthFactor * recencyWeight;
    boosted[i].final_score = Math.min(boosted[i].final_score * multiplier, 1);
    boosted[i].history_boosted = true;
    const after = boosted[i].final_score;
    console.log(
      `[history_boost] ${boosted[i].catalog_id} (${boosted[i].sku}) ` +
      `${before.toFixed(4)} -> ${after.toFixed(4)} ` +
      `(x${multiplier.toFixed(3)}, recency=${recencyWeight.toFixed(2)})`,
    );
    boostedCount++;
  }

  const reSorted = boosted.sort((a, b) => b.final_score - a.final_score);
  if (boostedCount > 0) {
    console.log(
      `[history_boost] boosted=${boostedCount} topN=${topN} depth_factor=${historyDepthFactor.toFixed(2)}`,
    );
  }
  return reSorted;
}

export async function POST(req: NextRequest) {
  try {
    const tRequest0 = Date.now();
    const body: SearchRequest = await req.json();
    const { query, customer_id, allow_history_without_customer } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Step 0: Route the query — classify and (if needed) resolve to a catalog
    // description before running the matcher pipeline.
    const tRoute0 = Date.now();
    const routed = await routeQuery(query, customer_id, !!allow_history_without_customer, supabase);
    const tRoute1 = Date.now();
    const effectiveQuery = routed.resolvedQuery;

    if (routed.requires_customer_confirmation) {
      return NextResponse.json(
        {
          error: "Customer-history query detected with no customer selected.",
          requires_customer_confirmation: true,
          routing: {
            classification: "action_history",
            original_query: routed.originalQuery,
            resolved_query: routed.resolvedQuery,
            reason: routed.reason,
            requires_customer_confirmation: true,
          },
        },
        { status: 409 },
      );
    }

    if (routed.originalQuery !== routed.resolvedQuery) {
      console.log(`[router] original: "${routed.originalQuery}"`);
      console.log(`[router] resolved: "${routed.resolvedQuery}"  (${routed.selectedCatalogId ?? "-"})`);
    }
    if (routed.reason) console.log(`[router] note: ${routed.reason}`);
    console.log(`[timing] router ${tRoute1 - tRoute0}ms`);

    // Step 1: Extract structured attributes from the (possibly resolved) query
    const tExtract0 = Date.now();
    const queryAttributes = await extractAttributes(effectiveQuery);
    const tExtract1 = Date.now();
    console.log(`[timing] extract ${tExtract1 - tExtract0}ms`);

    // Step 2: Generate embedding for the (possibly resolved) query
    const tEmbed0 = Date.now();
    const queryEmbedding = await getEmbedding(effectiveQuery);
    const tEmbed1 = Date.now();
    console.log(`[timing] embed ${tEmbed1 - tEmbed0}ms`);

    // Step 3: Fetch all catalog parts from Supabase
    const tFetch0 = Date.now();
    const { data: parts, error } = await supabase
      .from("catalog_parts")
      .select("*");
    const tFetch1 = Date.now();
    console.log(`[timing] fetch ${tFetch1 - tFetch0}ms (${parts?.length ?? 0} rows)`);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
    }

    const catalogParts = (parts ?? []) as CatalogPart[];

    // Step 4: Rank all parts using combined attribute + embedding score
    const tRank0 = Date.now();
    let ranked = rankParts(catalogParts, queryAttributes, queryEmbedding);

    // Step 5 (optional): for non-history queries, personalize with recent
    // customer order history if a customer was selected.
    if (customer_id && routed.classification !== "action_history") {
      const tHistory0 = Date.now();
      const { skuWeight, historyDepthFactor, recentCount } = await fetchRecentCustomerSkuWeights(customer_id);
      ranked = applyRecentHistoryBoost(ranked, skuWeight, historyDepthFactor);
      ranked = recomputeConfidence(ranked, queryAttributes);
      const tHistory1 = Date.now();
      console.log(
        `[timing] history_boost ${tHistory1 - tHistory0}ms (recent_orders=${recentCount})`,
      );
    }

    const tRank1 = Date.now();
    console.log(`[timing] rank ${tRank1 - tRank0}ms`);

    const top3 = [...ranked]
      .sort((a, b) => {
        if (b.final_score !== a.final_score) return b.final_score - a.final_score;
        return b.confidence - a.confidence;
      })
      .slice(0, 3);

    // Log attributes to console and persist to query_tests.csv
    logAndRecord(effectiveQuery, queryAttributes, top3);
    console.log(`[timing] total ${Date.now() - tRequest0}ms`);

    const response: SearchResponse = {
      results:          top3,
      query_attributes: queryAttributes,
      routing: {
        classification:      routed.classification,
        original_query:      routed.originalQuery,
        resolved_query:      routed.resolvedQuery,
        selected_catalog_id: routed.selectedCatalogId,
        reason:              routed.reason,
        requires_customer_confirmation: routed.requires_customer_confirmation,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
