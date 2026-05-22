import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON, getEmbedding } from "./ollama";

export type QueryClassification = "normal_search" | "action_catalog" | "action_history";

export interface RoutedQuery {
  classification: QueryClassification;
  resolvedQuery: string;
  originalQuery: string;
  selectedCatalogId?: string;
  reason?: string;
  classification_via?: "heuristic" | "llm";
}

type CatalogCandidate = {
  catalog_id: string;
  description: string;
  embedding: number[] | string | null;
  fastener_type?: string | null;
  material?: string | null;
  finish?: string | null;
};

function parseEmbedding(raw: number[] | string | null): number[] | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractKeywords(query: string): string[] {
  const stop = new Set([
    "i", "want", "the", "a", "an", "me", "you", "have", "give", "get",
    "with", "and", "for", "from", "my", "our", "we", "to", "in", "of",
    "item", "part", "please", "last", "ordered", "bought",
  ]);
  return query
    .toLowerCase()
    .split(/[^a-z0-9#\/\.-]+/)
    .filter((t) => t.length >= 2 && !stop.has(t))
    .slice(0, 8);
}

const CLASSIFIER_PROMPT = `You are a query router for a fastener catalog search API.
Classify into EXACTLY ONE:
- "normal_search": direct part query (sizes, materials, part names)
- "action_catalog": superlative/qualitative request not referencing customer history
- "action_history": request referencing previous purchases, "last ordered", "my company", etc.
Return ONLY JSON: {"type":"normal_search"|"action_catalog"|"action_history"}`;

async function classifyQuery(query: string): Promise<{ type: QueryClassification; via: "heuristic" | "llm" }> {
  const raw = await chatJSON(CLASSIFIER_PROMPT, query, { num_ctx: 4096 });
  try {
    const parsed = JSON.parse(raw);
    const t = parsed.type;
    if (t === "normal_search" || t === "action_catalog" || t === "action_history") {
      return { type: t, via: "llm" };
    }
  } catch {
    // ignore
  }
  return { type: "normal_search", via: "llm" };
}

function candidatePrompt(candidatesDump: string): string {
  return `You are selecting the BEST matching catalog item for an action-style user request.
Choose exactly one row from the candidate list.

Candidates (catalog_id | description):
${candidatesDump}

Return ONLY JSON:
{"catalog_id":"CAT-XXXX","description":"<exact description from candidate list>"}`;
}

async function fetchCatalogCandidates(query: string, supabase: SupabaseClient): Promise<CatalogCandidate[]> {
  const keywords = extractKeywords(query);
  const likelyPart = keywords.find((k) => ["washer", "nut", "rod", "bolt", "screw", "lag", "bhcs", "shcs"].includes(k));

  let dbQuery = supabase
    .from("catalog_parts")
    .select("catalog_id, description, embedding, fastener_type, material, finish")
    .limit(500);

  if (likelyPart) {
    dbQuery = dbQuery.ilike("description", `%${likelyPart}%`);
  }

  const { data, error } = await dbQuery;
  if (error || !data?.length) {
    const fallback = await supabase
      .from("catalog_parts")
      .select("catalog_id, description, embedding, fastener_type, material, finish")
      .limit(500);
    if (fallback.error || !fallback.data?.length) {
      throw new Error(`Catalog candidate fetch failed: ${fallback.error?.message ?? error?.message ?? "no rows"}`);
    }
    return fallback.data as CatalogCandidate[];
  }
  return data as CatalogCandidate[];
}

async function resolveFromCatalog(query: string, supabase: SupabaseClient): Promise<{ catalog_id: string; description: string }> {
  const t0 = Date.now();
  const candidates = await fetchCatalogCandidates(query, supabase);
  const t1 = Date.now();

  const queryEmbedding = await getEmbedding(query);
  const keywords = extractKeywords(query);

  const scored = candidates.map((c) => {
    const emb = parseEmbedding(c.embedding);
    const vecScore = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
    const desc = c.description.toLowerCase();
    const keywordHits = keywords.reduce((acc, k) => acc + (desc.includes(k) ? 1 : 0), 0);
    const keywordScore = keywords.length > 0 ? keywordHits / keywords.length : 0;
    const score = 0.7 * vecScore + 0.3 * keywordScore;
    return { ...c, score };
  });

  const topCandidates = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);

  const dump = topCandidates
    .map((c) => `${c.catalog_id} | ${c.description}`)
    .join("\n");

  const raw = await chatJSON(candidatePrompt(dump), query, { num_ctx: 8192 });
  const parsed = JSON.parse(raw);
  const found = topCandidates.find((c) => c.catalog_id === parsed.catalog_id);

  const t2 = Date.now();
  console.log(`[router] action_catalog candidates=${candidates.length} topk=60 fetch_ms=${t1 - t0} llm_ms=${t2 - t1}`);

  if (!found) {
    const best = topCandidates[0];
    return {
      catalog_id: best.catalog_id,
      description: best.description,
    };
  }
  return { catalog_id: found.catalog_id, description: found.description };
}

type AggregatedOrder = {
  sku: string;
  description: string;
  total_qty: number;
  num_orders: number;
  last_order: string;
};

function orderHistoryPrompt(orderDump: string): string {
  return `Pick the best matching historical item for the user's request.
Rows format:
SKU | description | total_qty | num_orders | last_order_date

${orderDump}

Return ONLY JSON:
{"sku":"...","description":"<exact description from rows>"}`;
}

async function resolveFromOrderHistory(
  query: string,
  customerId: string,
  supabase: SupabaseClient,
): Promise<{ catalog_id: string; description: string } | null> {
  const { data, error } = await supabase
    .from("order_history")
    .select("sku, description, quantity, order_date")
    .eq("customer_id", customerId);

  if (error || !data?.length) return null;

  const agg = new Map<string, AggregatedOrder>();
  for (const row of data as { sku: string; description: string; quantity: number; order_date: string }[]) {
    const existing = agg.get(row.sku);
    if (!existing) {
      agg.set(row.sku, {
        sku: row.sku,
        description: row.description,
        total_qty: row.quantity,
        num_orders: 1,
        last_order: row.order_date,
      });
      continue;
    }
    existing.total_qty += row.quantity;
    existing.num_orders += 1;
    if (row.order_date > existing.last_order) existing.last_order = row.order_date;
  }

  const rows = [...agg.values()]
    .sort((a, b) => b.total_qty - a.total_qty)
    .slice(0, 120);

  const dump = rows
    .map((e) => `${e.sku} | ${e.description} | total=${e.total_qty} | orders=${e.num_orders} | last=${e.last_order}`)
    .join("\n");

  const raw = await chatJSON(orderHistoryPrompt(dump), query, { num_ctx: 8192 });
  const parsed = JSON.parse(raw);

  const { data: part } = await supabase
    .from("catalog_parts")
    .select("catalog_id, description")
    .eq("sku", parsed.sku)
    .single();

  if (part) return { catalog_id: part.catalog_id, description: part.description };
  return { catalog_id: "", description: parsed.description ?? "" };
}

export async function routeQuery(
  query: string,
  customerId: string | undefined,
  supabase: SupabaseClient,
): Promise<RoutedQuery> {
  const t0 = Date.now();
  const { type: classification, via } = await classifyQuery(query);
  const t1 = Date.now();
  console.log(`[router] classification=${classification} via=${via} (${t1 - t0}ms)`);

  if (classification === "normal_search") {
    return { classification, resolvedQuery: query, originalQuery: query, classification_via: via };
  }

  if (classification === "action_history") {
    if (!customerId) {
      const fallback = await resolveFromCatalog(query, supabase);
      return {
        classification: "action_catalog",
        resolvedQuery: fallback.description,
        originalQuery: query,
        selectedCatalogId: fallback.catalog_id,
        reason: "no customer_id provided; fell back to catalog resolver",
        classification_via: via,
      };
    }

    const historyResult = await resolveFromOrderHistory(query, customerId, supabase);
    if (historyResult) {
      return {
        classification,
        resolvedQuery: historyResult.description,
        originalQuery: query,
        selectedCatalogId: historyResult.catalog_id,
        classification_via: via,
      };
    }

    const fallback = await resolveFromCatalog(query, supabase);
    return {
      classification: "action_catalog",
      resolvedQuery: fallback.description,
      originalQuery: query,
      selectedCatalogId: fallback.catalog_id,
      reason: "no order history found; fell back to catalog resolver",
      classification_via: via,
    };
  }

  const result = await resolveFromCatalog(query, supabase);
  return {
    classification,
    resolvedQuery: result.description,
    originalQuery: query,
    selectedCatalogId: result.catalog_id,
    classification_via: via,
  };
}
