import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../config/env';

export const qdrant = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY || undefined,
  checkCompatibility: false,
});

export async function qdrantHealthy(): Promise<void> {
  await qdrant.getCollections();
}
