import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { qdrant } from './client';

export const collections = {
  memory: `${env.QDRANT_COLLECTION_PREFIX}unsaid_memory`,
  wordmap: `${env.QDRANT_COLLECTION_PREFIX}unsaid_wordmap`,
};

type IndexSchema = 'keyword' | 'datetime';
const INDEXES: Record<string, Record<string, IndexSchema>> = {
  [collections.memory]: {
    userId: 'keyword',
    type: 'keyword',
    entities: 'keyword',
    createdAt: 'datetime',
    validUntil: 'datetime',
  },
  [collections.wordmap]: { userId: 'keyword', kind: 'keyword' },
};

/** Idempotent: safe to call on every boot. */
export async function bootstrapQdrant(dim: number = env.EMBEDDING_DIM): Promise<void> {
  const existing = new Set((await qdrant.getCollections()).collections.map((c) => c.name));
  for (const [name, indexes] of Object.entries(INDEXES)) {
    if (!existing.has(name)) {
      await qdrant.createCollection(name, { vectors: { size: dim, distance: 'Cosine' } });
      logger.info({ collection: name }, 'qdrant collection created');
    }
    for (const [field, schema] of Object.entries(indexes)) {
      await qdrant.createPayloadIndex(name, { field_name: field, field_schema: schema, wait: true });
    }
  }
}
