// Puts the demo patient back to a clean, recording-ready state: no old runs, questions, transcript or learned
// words, then re-seeds the persona, household memory and the recent conversation.
import { prisma } from '../src/db';
import { resetQdrantCollections } from '../src/adapters/qdrant/collections';
import { redis } from '../src/redis';
import { pendingKey } from '../src/confirmations/service';
import { seed } from './seed';

async function main() {
  const user = await prisma.user.findFirst({ where: { displayName: { startsWith: 'Mohan' } } });
  if (user) {
    const runs = await prisma.run.findMany({ where: { userId: user.id }, select: { id: true } });
    const runIds = runs.map((r) => r.id);
    await prisma.confirmation.deleteMany({ where: { userId: user.id } });
    await prisma.step.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.run.deleteMany({ where: { userId: user.id } });
    await prisma.transcriptSegment.deleteMany({ where: { userId: user.id } });
    await prisma.wordMapEntry.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { contextEnabled: true, assistMode: 'AUTO' } });
    await redis.del(pendingKey(user.id));
    console.log('Cleared runs, questions, transcript and word map for', user.displayName);
  }
  await resetQdrantCollections();
  await seed();
  console.log('Demo reset complete. Reload the console.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
