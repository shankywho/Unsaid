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

/** Idempotent: safe to call on every boot. Checks dimension and recreates if mismatched. */
export async function bootstrapQdrant(dim: number = env.EMBEDDING_DIM): Promise<void> {
  const existingList = (await qdrant.getCollections()).collections;
  const existing = new Set(existingList.map((c) => c.name));

  for (const [name, indexes] of Object.entries(INDEXES)) {
    if (existing.has(name)) {
      try {
        const info = await qdrant.getCollection(name);
        const vectors = info.config?.params?.vectors;
        const existingSize =
          typeof vectors === 'object' && vectors !== null && 'size' in vectors
            ? (vectors as { size: number }).size
            : undefined;

        if (existingSize && existingSize !== dim) {
          if (env.QDRANT_ALLOW_RESET) {
            logger.warn(
              { collection: name, existingSize, requestedDim: dim },
              'Qdrant collection dimension mismatch. QDRANT_ALLOW_RESET=true: dropping and recreating collection...',
            );
            await qdrant.deleteCollection(name);
            existing.delete(name);
          } else {
            throw new Error(
              `Qdrant collection '${name}' vector dimension mismatch: existing collection has size ${existingSize}, but requested EMBEDDING_DIM is ${dim}. ` +
                `Recreating collections will drop all existing vectors. Set QDRANT_ALLOW_RESET=true or run 'pnpm qdrant:reset' to recreate.`,
            );
          }
        }
      } catch (err) {
        logger.warn({ collection: name, err }, 'Failed to inspect existing collection config');
      }
    }

    if (!existing.has(name)) {
      await qdrant.createCollection(name, { vectors: { size: dim, distance: 'Cosine' } });
      logger.info({ collection: name, dim }, 'qdrant collection created');
    }

    for (const [field, schema] of Object.entries(indexes)) {
      try {
        await qdrant.createPayloadIndex(name, { field_name: field, field_schema: schema, wait: true });
      } catch {
        // Payload index might already exist
      }
    }
  }
}

/** Explicitly drop and recreate all Unsaid Qdrant collections. */
export async function resetQdrantCollections(dim: number = env.EMBEDDING_DIM): Promise<void> {
  for (const name of Object.keys(INDEXES)) {
    try {
      await qdrant.deleteCollection(name);
      logger.info({ collection: name }, 'qdrant collection dropped');
    } catch {
      // ignore if non-existent
    }
  }
  await bootstrapQdrant(dim);
}
