# Paragon Take-Home: Catalog Match — Implementation Plan

## Problem Summary
Build a single-page web app where a user types a free-form description of a fastener/hardware part and receives the top 3 matching catalog entries. An optional customer selector enables personalized results using order history (stretch challenge).

---

## API Choice: Google Gemini (Google AI Studio)
- **Attribute extraction**: `gemini-2.0-flash` — structured JSON output, free tier (15 req/min, 1M req/day)
- **Vector embeddings**: `text-embedding-004` — 768-dimension embeddings, free tier (1500 req/min)
- **Why**: Single provider, single API key, no billing required, both tasks covered

---

## Tech Stack
| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL + pgvector extension) |
| Embeddings | Google `text-embedding-004` via Gemini API |
| AI Extraction | Google `gemini-2.0-flash` via Gemini API |
| Matching Logic | Next.js API route (server-side, not in Postgres) |

---

## Extracted Attributes Schema
Every catalog part and every incoming query is classified into the following attributes via the Gemini API with a strict JSON response schema:

| Attribute | Description | Example Values | Weight |
|---|---|---|---|
| `fastener_type` | The type/category of the fastener | `hex cap screw`, `lag screw`, `flat washer`, `socket head cap screw`, `button socket cap screw`, `hex nut`, `lock washer`, `threaded rod`, `tap bolt`, `phillips pan machine screw` | 0.25 |
| `drive_type` | Head or drive style | `hex`, `socket`, `phillips`, `slotted`, `button socket` | 0.08 |
| `thread_size` | Thread designation only (no pitch or length) | `m8`, `1/2-13`, `1/4-20`, `#8-32`, `m12`, `7/16-14` | 0.30 |
| `length` | Length of the fastener | `30mm`, `1-1/2"`, `6ft`, `3/4"` | 0.15 |
| `material` | Base material | `steel`, `brass`, `stainless steel`, `alloy` | 0.10 |
| `grade` | Grade, class, or alloy spec | `class 8`, `18-8 ss`, `316 ss`, `a2 ss`, `astm a307`, `alloy`, `ifi 111` | 0.05 |
| `finish` | Surface finish or coating | `zinc`, `yellow zinc`, `black oxide`, `hdg`, `plain`, `mechanical zinc` | 0.04 |
| `standard` | Referenced industry standard | `iso 7380`, `ifi 111`, `asme b18.2.1`, `din 933`, `din 912`, `astm a307` | 0.03 |

**Total attribute weight = 1.00**

> Null values are valid — if an attribute is not present in the description, the JSON field is `null`.

---

## Scoring Model

### Step 1: Attribute Match Score
For each catalog part, compare its extracted attributes to the query's extracted attributes:

```
attr_score = Σ (attribute_weight[i] * match[i]) / Σ (attribute_weight[i] for non-null query attrs)
```

- `match[i]` = 1 if both query and part have the same non-null value for attribute `i`, else 0
- Only attributes present (non-null) in the **query** contribute to the denominator
- This normalizes the score so sparse queries (e.g. "M8 flat washer" with only 2 attrs) still produce meaningful scores

### Step 2: Vector Embedding Cosine Similarity
- Embed the raw query description using `text-embedding-004`
- Compute cosine similarity against every part's pre-computed embedding stored in pgvector
- Returns a score in [0, 1]

### Step 3: Combined Final Score
```
final_score = (W_ATTR * attr_score) + (W_EMBED * embedding_score)
```

**Default weights** (tunable via environment/config):
- `W_ATTR = 0.60` — structured attribute matching is more reliable for fastener disambiguation
- `W_EMBED = 0.40` — semantic embedding captures abbreviations, synonyms, and fuzzy matches

Top 3 results are ranked by `final_score` descending.

---

## Data Pipeline (One-Time Preprocessing)

### Script: `scripts/process-catalog.ts`
1. Read `catalog.csv` (1000 rows)
2. For each row, call Gemini `gemini-2.0-flash` with the attribute extraction system prompt
3. For each row, call Gemini `text-embedding-004` to generate a 768-dim embedding
4. Normalize: lowercase all extracted attribute string values
5. Write output to `catalog_processed.csv` (original columns + one column per attribute + embedding JSON array column)

### Script: `scripts/upload-catalog.ts`
1. Read `catalog_processed.csv`
2. Upsert all rows into Supabase `catalog_parts` table (including pgvector embedding column)
3. Also upload `order_history.csv` rows into `order_history` table

> **Why not manipulate directly in Supabase?** The attribute extraction and embedding generation require calling external APIs row-by-row. This is cleanest as a local script. The result is a fully enriched CSV that is then uploaded in one shot. Supabase Studio also lets you import CSVs directly but the embedding column (768-dim float array) makes that impractical — upsert via the JS client is the right approach.

---

## Database Schema (Supabase / PostgreSQL)

### `catalog_parts` table
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE catalog_parts (
  catalog_id     TEXT PRIMARY KEY,
  sku            TEXT NOT NULL,
  description    TEXT NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  fastener_type  TEXT,
  drive_type     TEXT,
  thread_size    TEXT,
  length         TEXT,
  material       TEXT,
  grade          TEXT,
  finish         TEXT,
  standard       TEXT,
  embedding      vector(768)
);
```

### `order_history` table
```sql
CREATE TABLE order_history (
  id             SERIAL PRIMARY KEY,
  customer_id    TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  order_date     DATE NOT NULL,
  sku            TEXT NOT NULL,
  description    TEXT NOT NULL,
  quantity       INTEGER NOT NULL
);
```

---

## API Routes (Next.js)

### `POST /api/search`
**Request body**: `{ query: string, customer_id?: string }`

**Logic**:
1. Extract attributes from query via Gemini (`gemini-2.0-flash`, JSON mode)
2. Embed query via Gemini (`text-embedding-004`)
3. Fetch all catalog parts from Supabase (with embeddings + attributes)
4. Compute `attr_score` for each part in memory
5. Compute `embedding_score` (cosine similarity) for each part in memory
6. Compute `final_score = W_ATTR * attr_score + W_EMBED * embedding_score`
7. (Stretch) If `customer_id` provided, apply order history personalization boost
8. Return top 3 sorted by `final_score`

### `GET /api/customers`
Returns list of `{ customer_id, customer_name }` for the dropdown selector.

---

## Attribute Extraction System Prompt
Carefully engineered prompt that:
- Defines all 8 attributes with explicit descriptions and example values
- Handles industry abbreviations: SHCS = socket head cap screw, BHCS = button head cap screw, HHB = hex head bolt, SS = stainless steel, HDG = hot dip galvanized, YZ/YZN = yellow zinc, ZC/ZN = zinc, BO = black oxide, MZ = mechanical zinc, PL = plain
- Normalizes metric thread designations: "M8-1.25" → thread_size = "m8" (pitch goes to its own field if present)
- Normalizes imperial: "1/2-13" stays as "1/2-13", "1/2 inch" → "1/2-13" is NOT assumed (leave as "1/2")
- Returns strict JSON with null for missing fields

---

## File Structure
```
/
├── plan.md
├── catalog.csv                  # original input
├── order_history.csv            # original input
├── catalog_processed.csv        # generated by process-catalog script
├── .env.local                   # GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # single-page UI
│   ├── globals.css
│   └── api/
│       ├── search/route.ts      # main matching endpoint
│       └── customers/route.ts   # customer list for dropdown
├── components/
│   ├── SearchBar.tsx
│   ├── CustomerSelect.tsx
│   ├── ResultCard.tsx
│   └── LoadingSpinner.tsx
├── lib/
│   ├── supabase.ts              # supabase client
│   ├── gemini.ts                # gemini client (embeddings + extraction)
│   ├── attribute-extractor.ts   # calls gemini, returns typed attribute JSON
│   ├── matcher.ts               # scoring logic (attr match + cosine sim)
│   └── weights.ts               # all tunable scoring weights
└── scripts/
    ├── process-catalog.ts       # enriches catalog CSV with attributes + embeddings
    └── upload-catalog.ts        # uploads enriched CSV to Supabase
```

---

## Stretch Challenge: Order History Personalization
When a customer is selected:
1. Fetch their order history from `order_history` table
2. Build a "customer profile" from their historical orders:
   - Most frequently ordered: material, finish, grade, standard
   - Recent orders weighted more heavily (recency decay)
3. Apply a personalization boost to the `attr_score`:
   - Parts whose material/finish/grade align with the customer's profile get a small additive boost
4. Edge cases:
   - New customer / no history → fall back to base scoring, no boost applied
   - History conflicts with query → query attributes take priority, history only used as tiebreaker
   - Sparse history (1-2 orders) → apply reduced boost weight to avoid over-fitting

---

## Confidence Score (TBD)
Separate from the ranking score. To be designed after base scoring is validated. Will likely incorporate:
- How many query attributes were matched vs. total query attributes
- Margin between top result and 2nd result
- Whether vector and attribute scores agreed or diverged

---

## Build Order
1. ✅ Plan documented
2. UI scaffold (Next.js + Tailwind, static UI only)
3. Supabase schema setup + pgvector extension
4. Preprocessing scripts (attribute extraction + embedding generation)
5. Upload script
6. `/api/search` matching logic
7. Wire UI to API
8. Stretch: customer personalization
9. Confidence score design
