export interface PartAttributes {
  fastener_type: string | null;
  thread_size:   string | null;
  length:        string | null;
  material:      string | null;
  grade:         string | null;
  finish:        string | null;
  standard:      string | null;
}

export interface CatalogPart extends PartAttributes {
  catalog_id:  string;
  sku:         string;
  description: string;
  active:      boolean;
  embedding:   number[] | null;
}

export interface SearchResult {
  catalog_id:      string;
  sku:             string;
  description:     string;
  active:          boolean;
  attributes:      PartAttributes;
  final_score:     number;
  attr_score:      number;
  embedding_score: number;
  confidence:      number; // 0–1, independent signal for display
  history_boosted?: boolean;
}

export interface SearchRequest {
  query: string;
  customer_id?: string;
  allow_history_without_customer?: boolean;
}

export interface SearchResponse {
  results:           SearchResult[];
  query_attributes:  PartAttributes;
  routing?: {
    classification:     "normal_search" | "action_catalog" | "action_history";
    original_query:     string;
    resolved_query:     string;
    selected_catalog_id?: string;
    reason?:            string;
    requires_customer_confirmation?: boolean;
  };
}

export interface Customer {
  customer_id:   string;
  customer_name: string;
}
