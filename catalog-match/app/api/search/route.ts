import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase } from "@/lib/supabase";
import { extractAttributes } from "@/lib/attribute-extractor";
import { getEmbedding } from "@/lib/ollama";
import { rankParts } from "@/lib/matcher";
import type { CatalogPart, PartAttributes, SearchRequest, SearchResponse } from "@/lib/types";

const CSV_PATH = path.join(process.cwd(), "..", "query_tests.csv");

const CSV_HEADERS = [
  "timestamp",
  "query",
  "fastener_type",
  "drive_type",
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
    escapeCSV(attrs.drive_type),
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

export async function POST(req: NextRequest) {
  try {
    const body: SearchRequest = await req.json();
    const { query } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Step 1: Extract structured attributes from the query
    const queryAttributes = await extractAttributes(query);

    // Step 2: Generate embedding for the query
    const queryEmbedding = await getEmbedding(query);

    // Step 3: Fetch all catalog parts from Supabase
    const { data: parts, error } = await supabase
      .from("catalog_parts")
      .select("*");

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
    }

    const catalogParts = (parts ?? []) as CatalogPart[];

    // Step 4: Rank all parts using combined attribute + embedding score
    const ranked = rankParts(catalogParts, queryAttributes, queryEmbedding);

    const top3 = ranked.slice(0, 3);

    // Log attributes to console and persist to query_tests.csv
    logAndRecord(query, queryAttributes, top3);

    const response: SearchResponse = {
      results: top3,
      query_attributes: queryAttributes,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
