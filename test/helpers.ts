import { prisma } from '../src/db';
import { redis } from '../src/redis';
import { qdrant } from '../src/adapters/qdrant/client';
import { bootstrapQdrant, collections } from '../src/adapters/qdrant/collections';

export async function resetAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Step","Run","Confirmation","WordMapEntry","TranscriptSegment","RawWebhook","User" CASCADE',
  );
  await redis.flushdb();
  await bootstrapQdrant();
  for (const name of Object.values(collections)) {
    await qdrant.delete(name, { wait: true, filter: { must: [{ is_empty: { key: 'nonexistent' } }] } });
  }
}

export async function makeUser(
  over: Partial<{ displayName: string; contextEnabled: boolean; omiUid: string }> = {},
) {
  return prisma.user.create({
    data: { displayName: 'Mohan', caregiverName: 'Sunita', ...over },
  });
}
