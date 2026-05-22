// Tunable scoring weights — adjust these to calibrate match quality

// Weight of the structured attribute matching score vs. vector embedding score
export const W_ATTR = 0.60;
export const W_EMBED = 0.40;

// Confidence score weights (must sum to 1.0)
// Confidence is a separate display metric from the ranking score
export const CONFIDENCE_WEIGHTS = {
  query_coverage: 0.30, // how many attributes were extractable from the query
  top_score:      0.30, // absolute quality of this result's final_score
  score_margin:   0.25, // how far ahead is this result vs the next best (decayed by rank)
  attr_hit_rate:  0.15, // fraction of queried attributes that actually matched
};

// Per-attribute weights (must sum to 1.0)
// Higher weight = attribute matters more when present in a query
export const ATTRIBUTE_WEIGHTS: Record<string, number> = {
  thread_size:   0.30, // most critical — wrong thread = wrong part
  fastener_type: 0.25, // second most critical — defines the part category
  length:        0.15, // highly relevant for most fastener queries
  material:      0.10, // important but often omitted in queries
  drive_type:    0.08, // head/drive style matters for assembly
  grade:         0.05, // grade/class is a secondary qualifier
  finish:        0.04, // finish is often a soft preference
  standard:      0.03, // standard is rarely specified in customer queries
};
