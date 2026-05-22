import { ATTRIBUTE_WEIGHTS, W_ATTR, W_EMBED, CONFIDENCE_WEIGHTS } from "./weights";
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
      drive_type:    part.drive_type,
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
    };
  });

  const sorted = results.sort((a, b) => b.final_score - a.final_score);

  // Compute confidence scores now that we have the ranked order
  const nonNullQueryAttrs = Object.values(queryAttrs).filter((v) => v !== null).length;
  const queryCoverage     = nonNullQueryAttrs / Object.keys(queryAttrs).length;
  const top               = sorted[0];
  const second            = sorted[1];

  const topScore    = top?.final_score ?? 0;
  const secondScore = second?.final_score ?? 0;
  const rawMargin   = topScore > 0 ? (topScore - secondScore) / topScore : 1;
  // Cap margin contribution — a 50% gap already means very clear winner
  const margin      = Math.min(rawMargin * 2, 1);

  return sorted.map((result, i) => {
    // Only the top result gets a meaningful confidence — lower ranks are
    // inherently less certain, so decay confidence by rank position
    const rankDecay = 1 / (i + 1);

    const confidence = Math.min(
      CONFIDENCE_WEIGHTS.query_coverage * queryCoverage +
      CONFIDENCE_WEIGHTS.top_score      * result.final_score +
      CONFIDENCE_WEIGHTS.score_margin   * margin * rankDecay +
      CONFIDENCE_WEIGHTS.attr_hit_rate  * result.attr_score,
      1
    );

    return { ...result, confidence };
  });
}
