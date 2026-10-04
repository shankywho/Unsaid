import { LOCAL_EMBEDDING_DIM, LOCAL_EMBEDDING_MODEL } from '../../config/env';
import { logger } from '../../lib/logger';
import type { Embedder } from './types';

type Extractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Sentence embeddings that run inside this process (all-MiniLM-L6-v2, 384-d, ~25 MB downloaded on first use).
 * No API key; semantic enough for fact retrieval. Used when OPENAI_API_KEY is not set.
 */
export class LocalEmbedder implements Embedder {
  readonly dim = LOCAL_EMBEDDING_DIM;
  private extractor?: Promise<Extractor>;

  private load(): Promise<Extractor> {
    this.extractor ??= (async () => {
      logger.info({ model: LOCAL_EMBEDDING_MODEL }, 'Loading local embedding model (first use downloads it)');
      const { pipeline } = await import('@huggingface/transformers');
      return (await pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL)) as unknown as Extractor;
    })();
    return this.extractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extract = await this.load();
    const out = await extract(texts, { pooling: 'mean', normalize: true });
    return out.tolist();
  }
}
