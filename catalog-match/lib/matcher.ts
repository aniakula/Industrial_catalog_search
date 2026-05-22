import { ATTRIBUTE_WEIGHTS, W_ATTR, W_EMBED, CONFIDENCE_WEIGHTS, QUERY_COVERAGE_SCORES } from "./weights";
import type { CatalogPart, PartAttributes, SearchResult } from "./types";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeAttributeScore(
  queryAttrs: PartAttributes,
  partAttrs: PartAttributes
): number {
  let weightedMatches = 0;
  let totalQueryWeight = 0;

  for (const [attr, weight] of Object.entries(ATTRIBUTE_WEIGHTS)) {
    const queryVal = queryAttrs[attr as keyof PartAttributes];
    if (queryVal === null || queryVal === undefined) continue;

    totalQueryWeight += weight;
    const partVal = partAttrs[attr as keyof PartAttributes];
    if (partVal !== null && partVal !== undefined && partVal === queryVal) {
      weightedMatches += weight;
    }
  }

  if (totalQueryWeight === 0) return 0;
  return weightedMatches / totalQueryWeight;
}

// Supabase returns pgvector columns as a string "[0.1,0.2,...]" — parse if needed
function parseEmbedding(raw: number[] | string | null): number[] | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

export function rankParts(
  parts: CatalogPart[],
  queryAttrs: PartAttributes,
  queryEmbedding: number[]
): SearchResult[] {
  const results: SearchResult[] = parts.map((part) => {
    const partAttrs: PartAttributes = {
      fastener_type: part.fastener_type,
      thread_size:   part.thread_size,
      length:        part.length,
      material:      part.material,
      grade:         part.grade,
      finish:        part.finish,
      standard:      part.standard,
    };

    const embedding      = parseEmbedding(part.embedding as number[] | string | null);
    const attr_score     = computeAttributeScore(queryAttrs, partAttrs);
    const embedding_score = embedding
      ? cosineSimilarity(queryEmbedding, embedding)
      : 0;
    const final_score     = W_ATTR * attr_score + W_EMBED * embedding_score;

    return {
      catalog_id:      part.catalog_id,
      sku:             part.sku,
      description:     part.description,
      active:          part.active,
      attributes:      partAttrs,
      attr_score,
      embedding_score,
      final_score,
      confidence:      0, // placeholder — computed after sorting below
      history_boosted: false,
    };
  });

  const sorted = [...results].sort((a, b) => b.final_score - a.final_score);
  return recomputeConfidence(sorted, queryAttrs);
}

export function recomputeConfidence(
  rankedByScore: SearchResult[],
  queryAttrs: PartAttributes,
): SearchResult[] {
  // Compute confidence scores now that we have the ranked order
  const nonNullQueryAttrs = Object.values(queryAttrs).filter((v) => v !== null).length;
  const queryCoverage     = QUERY_COVERAGE_SCORES[nonNullQueryAttrs] ?? 0;

  // Per-rank margin: each entry is compared to the next entry below it.
  // Rank #1 → gap vs rank #2, rank #2 → gap vs rank #3.
  const TOP_N_MARGINS = 3;
  const perRankMargin: number[] = Array.from({ length: TOP_N_MARGINS }, (_, i) => {
    const thisScore = rankedByScore[i]?.final_score   ?? 0;
    const nextScore = rankedByScore[i + 1]?.final_score ?? 0;
    const raw       = thisScore > 0 ? (thisScore - nextScore) / thisScore : 1;
    return Math.min(raw * 2, 1); // cap: a 50% gap already signals a clear winner
  });

  return rankedByScore.map((result, i) => {
    // Use the per-rank margin when available; fall back to the last computed
    // margin for any results beyond TOP_N_MARGINS.
    const margin = perRankMargin[Math.min(i, TOP_N_MARGINS - 1)];

    // queryCoverage is a multiplier — a vague query gates the whole score down
    // no matter how strong the embedding match is.
    // score_power < 1 amplifies mid-range final_scores without capping perfect ones.
    // margin_bonus adds a proportional lift for results with a large lead over #next.
    const amplified  = Math.pow(result.final_score, CONFIDENCE_WEIGHTS.score_power);
    const inner      = amplified * (1 + CONFIDENCE_WEIGHTS.margin_bonus * margin);
    const confidence = Math.min(queryCoverage * inner, 1);

    return { ...result, confidence };
  });
}
