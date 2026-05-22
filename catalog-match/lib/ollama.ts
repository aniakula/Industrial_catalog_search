import { Ollama } from "ollama";

const OLLAMA_HOST        = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const EXTRACTION_MODEL   = "qwen2.5:7b";
const EMBEDDING_MODEL    = "nomic-embed-text";

// Lazy client
let _client: Ollama | null = null;

function getClient(): Ollama {
  if (!_client) _client = new Ollama({ host: OLLAMA_HOST });
  return _client;
}

/**
 * Call the extraction LLM and return its raw text response.
 * `format: "json"` forces the model to produce valid JSON.
 */
export async function extractJSON(prompt: string): Promise<string> {
  const response = await getClient().chat({
    model:    EXTRACTION_MODEL,
    messages: [{ role: "user", content: prompt }],
    format:   "json",
    options:  { temperature: 0 },
  });
  return response.message.content;
}

/**
 * Embed a single text string. Returns a 768-dim float array.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const response = await getClient().embed({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.embeddings[0] ?? [];
}

/**
 * Embed multiple texts in a single call. Returns an array of 768-dim vectors.
 */
export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await getClient().embed({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.embeddings ?? [];
}
