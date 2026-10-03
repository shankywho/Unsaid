import { resetQdrantCollections } from '../src/adapters/qdrant/collections';
import { env } from '../src/config/env';

async function main() {
  console.log(`Resetting Qdrant collections with embedding dimension: ${env.EMBEDDING_DIM}...`);
  await resetQdrantCollections(env.EMBEDDING_DIM);
  console.log('Qdrant collections reset successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to reset Qdrant collections:', err);
  process.exit(1);
});
