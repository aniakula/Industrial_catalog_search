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
 * Generic JSON-mode chat with separate system/user roles.
 * `num_ctx` defaults large enough for small prompts; bump it for big dumps
 * like catalog or order history (otherwise Ollama silently truncates).
 */
export async function chatJSON(
  systemPrompt: string,
  userContent: string,
  opts: { num_ctx?: number; temperature?: number } = {},
): Promise<string> {
  const response = await getClient().chat({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userContent  },
    ],
    format: "json",
    keep_alive: "30m",
    options: {
      temperature: opts.temperature ?? 0,
      num_ctx:     opts.num_ctx     ?? 4096,
    },
  });
  return response.message.content;
}

/**
 * Backwards-compatible wrapper for attribute extraction.
 */
export async function extractJSON(systemPrompt: string, userContent: string): Promise<string> {
  return chatJSON(systemPrompt, userContent);
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

