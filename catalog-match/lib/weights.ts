// Tunable scoring weights — adjust these to calibrate match quality

// Weight of the structured attribute matching score vs. vector embedding score
export const W_ATTR = 0.60;
export const W_EMBED = 0.40;

// Confidence score formula:
//   confidence = queryCoverage × final_score^score_power × (1 + margin_bonus × margin)
//
// queryCoverage acts as a MULTIPLIER — a vague query always produces low
// confidence regardless of match strength.
// score_power < 1 amplifies mid-range final_scores (e.g. 0.73^0.6 ≈ 0.83).
// margin_bonus adds up to margin_bonus × 100% extra for a perfect margin gap.
export const CONFIDENCE_WEIGHTS = {
  score_power:   0.60, // exponent applied to final_score (< 1 = amplifies mid-range)
  margin_bonus:  0.25, // max multiplicative bonus from margin (0 = no bonus, 1 = doubles)
};

// Query coverage lookup: maps number of non-null extracted attributes (0–7)
// to a coverage score. Falls off sharply below 5 — high specificity queries
// (5–7 attributes) should all read as high confidence.
export const QUERY_COVERAGE_SCORES: Record<number, number> = {
  0: 0.00,
  1: 0.08,
  2: 0.20,
  3: 0.45,
  4: 0.65,
  5: 0.90,
  6: 0.95,
  7: 1.00,
};

// Per-attribute weights (must sum to 1.0)
// Higher weight = attribute matters more when present in a query
export const ATTRIBUTE_WEIGHTS: Record<string, number> = {
  thread_size:   0.30, // most critical — wrong thread = wrong part
  fastener_type: 0.20, // defines the part category
  length:        0.20, // highly relevant for most fastener queries
  material:      0.10, // important but often omitted in queries
  grade:         0.05, // grade/class is a secondary qualifier
  finish:        0.10, // finish is often a soft preference
  standard:      0.05, // standard is rarely specified in customer queries
};
