import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db';
import { bootstrapQdrant } from '../src/adapters/qdrant/collections';
import { runIngestPipeline } from '../src/orchestrator/ingestPipeline';
import { upsertSubstitution } from '../src/memory/wordMap';

export async function seed(): Promise<string> {
  console.log('Seeding Unsaid demo persona & ambient memory...');

  await bootstrapQdrant();

  const personaPath = path.resolve(__dirname, '../fixtures/persona-ramesh-family.json');
  const ambientPath = path.resolve(__dirname, '../fixtures/ambient-week.json');

  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
  const ambientSegments = JSON.parse(fs.readFileSync(ambientPath, 'utf8'));

  // Upsert demo patient
  let user = await prisma.user.findFirst({
    where: { displayName: persona.patient.name },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        displayName: persona.patient.name,
        caregiverName: persona.caregiver.name,
        contextEnabled: true,
        assistMode: 'AUTO',
        omiUid: 'omi_mohan_demo',
      },
    });
    console.log(`Created demo user: ${user.displayName} (${user.id})`);
  } else {
    console.log(`Found existing demo user: ${user.displayName} (${user.id})`);
  }

  // Batch ambient segments into windows of 6
  const windowSize = 6;
  const sessionId = `seed_ambient_week_${Date.now()}`;
  let totalFacts = 0;

  for (let i = 0; i < ambientSegments.length; i += windowSize) {
    const chunk = ambientSegments.slice(i, i + windowSize);
    const result = await runIngestPipeline({
      userId: user.id,
      sessionId,
      segments: chunk.map((s: any, idx: number) => ({
        id: `seg_seed_${i + idx}`,
        text: s.text,
        speaker: s.speaker,
      })),
    });
    totalFacts += result.facts.length;
  }

  console.log(
    `Ingested ${ambientSegments.length} ambient segments -> ${totalFacts} memory facts stored in Qdrant.`,
  );

  // Seed baseline word-map substitutions
  await upsertSubstitution(user.id, 'car', 'walk', 'SUBSTITUTION');
  await upsertSubstitution(user.id, 'Pri', 'Priya', 'NAME_ALIAS');
  console.log('Seeded initial word map patterns: "car" -> "walk", "Pri" -> "Priya"');

  console.log('Seed completed successfully!');
  return user.id;
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
