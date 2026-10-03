import { env } from '../../config/env';
import { fetchRetry } from '../../lib/http';
import type { Embedder } from './types';

export class OpenAIEmbedder implements Embedder {
  readonly dim = env.EMBEDDING_DIM;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    const res = await fetchRetry('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      timeoutMs: 10_000,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: texts, dimensions: env.EMBEDDING_DIM }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings HTTP ${res.status}`);
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
