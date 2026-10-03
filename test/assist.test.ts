import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { prisma } from '../src/db';
import { resetAll, makeUser } from './helpers';
import { upsertMemoryFact } from '../src/memory/memoryStore';
import { env } from '../src/config/env';

describe('Phase 5 — ASSIST pipeline, confirmation state machine, and audio', () => {
  const app = createApp();
  const authHeader = { Authorization: `Bearer ${env.API_KEY}` };

  beforeEach(async () => {
    await resetAll();
  });

  it('Integration Test 2: Fragment -> confirmation asked -> answer yes -> resolved event + audio', async () => {
    const user = await makeUser({ displayName: 'Mohan' });

    // Seed personal memory facts
    await upsertMemoryFact(user.id, {
      type: 'event',
      text: 'Priya is visiting on Sunday',
      entities: ['Priya', 'Sunday'],
      confidence: 0.95,
    });
    await upsertMemoryFact(user.id, {
      type: 'health_instruction',
      text: 'Dr. Mehta said Papa should avoid sugar and sweets',
      entities: ['Dr. Mehta', 'Papa', 'sugar'],
      confidence: 0.95,
    });

    // Patient speaks fragment: "Sunday Priya cake no"
    const fragRes = await request(app)
      .post('/v1/simulate/fragment')
      .set(authHeader)
      .send({
        userId: user.id,
        text: 'Sunday Priya cake no',
      })
      .expect(200);

    expect(fragRes.body.ok).toBe(true);
    const { runId, confirmationId } = fragRes.body.data;
    expect(runId).toBeDefined();
    expect(confirmationId).toBeDefined();

    // Check confirmation status in DB
    const conf = await prisma.confirmation.findUnique({ where: { id: confirmationId } });
    expect(conf).toBeDefined();
    expect(conf?.status).toBe('PENDING');
    expect(conf?.questionAudio).toBeDefined();
    expect(conf?.question.toLowerCase()).toContain('priya');

    // Test audio route GET /v1/audio/:id
    const audioRes = await request(app).get(`/v1/audio/${conf!.questionAudio}`).expect(200);
    expect(audioRes.headers['content-type']).toContain('audio/mpeg');
    expect(audioRes.body.length).toBeGreaterThan(500);

    // Answer YES to the confirmation
    const ansRes = await request(app)
      .post(`/v1/confirmations/${confirmationId}/answer`)
      .set(authHeader)
      .send({ answer: 'yes' })
      .expect(200);

    expect(ansRes.body.ok).toBe(true);
    expect(ansRes.body.data.resolved).toBe(true);
    expect(ansRes.body.data.finalSentence).toContain('Priya');
    expect(ansRes.body.data.finalAudio).toBeDefined();

    // Verify confirmation and run status in DB
    const resolvedConf = await prisma.confirmation.findUnique({ where: { id: confirmationId } });
    expect(resolvedConf?.status).toBe('CONFIRMED');
    expect(resolvedConf?.confirmedIdx).toBe(0);

    const run = await prisma.run.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('SUCCEEDED');
  });

  it('Integration Test 3: answer no x3 -> REJECTED_ALL + fallback question', async () => {
    const user = await makeUser({ displayName: 'Mohan' });

    const fragRes = await request(app)
      .post('/v1/simulate/fragment')
      .set(authHeader)
      .send({
        userId: user.id,
        text: 'Sunday Priya cake no',
      })
      .expect(200);

    const { confirmationId, runId } = fragRes.body.data;

    // Answer NO (attempt 1 -> 2)
    const ans1 = await request(app)
      .post(`/v1/confirmations/${confirmationId}/answer`)
      .set(authHeader)
      .send({ answer: 'no' })
      .expect(200);

    expect(ans1.body.data.resolved).toBe(false);
    let conf = await prisma.confirmation.findUnique({ where: { id: confirmationId } });
    expect(conf?.currentIndex).toBe(1);
    expect(conf?.status).toBe('PENDING');

    // Answer NO (attempt 2 -> 3)
    const ans2 = await request(app)
      .post(`/v1/confirmations/${confirmationId}/answer`)
      .set(authHeader)
      .send({ answer: 'no' })
      .expect(200);

    expect(ans2.body.data.resolved).toBe(false);
    conf = await prisma.confirmation.findUnique({ where: { id: confirmationId } });
    expect(conf?.currentIndex).toBe(2);
    expect(conf?.status).toBe('PENDING');

    // Answer NO (attempt 3 -> all rejected)
    const ans3 = await request(app)
      .post(`/v1/confirmations/${confirmationId}/answer`)
      .set(authHeader)
      .send({ answer: 'no' })
      .expect(200);

    expect(ans3.body.data.resolved).toBe(false);
    expect(ans3.body.data.fallbackQuestion).toBeDefined();

    conf = await prisma.confirmation.findUnique({ where: { id: confirmationId } });
    expect(conf?.status).toBe('REJECTED_ALL');

    const run = await prisma.run.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('FAILED');
  });

  it('Integration Test 5: contextEnabled=false -> memory retrieval steps skipped (ablation)', async () => {
    // User with context disabled
    const user = await makeUser({ displayName: 'Mohan Ablation', contextEnabled: false });

    // Seed facts that should NOT be used
    await upsertMemoryFact(user.id, {
      type: 'event',
      text: 'Priya is visiting on Sunday',
      entities: ['Priya', 'Sunday'],
      confidence: 0.95,
    });

    const fragRes = await request(app)
      .post('/v1/simulate/fragment')
      .set(authHeader)
      .send({
        userId: user.id,
        text: 'Sunday Priya cake no',
      })
      .expect(200);

    const { runId } = fragRes.body.data;

    // Inspect DAG steps in database
    const steps = await prisma.step.findMany({ where: { runId } });
    const memStep = steps.find((s) => s.node === 'retrieve_memory');
    const wordStep = steps.find((s) => s.node === 'retrieve_wordmap');

    expect(memStep).toBeDefined();
    expect(memStep?.status).toBe('SKIPPED');
    expect(wordStep).toBeDefined();
    expect(wordStep?.status).toBe('SKIPPED');

    const hypoStep = steps.find((s) => s.node === 'hypothesize');
    expect(hypoStep?.status).toBe('COMPLETED');
    const hypoOutput = hypoStep?.output as any[];
    // Without context, evidenceIds should be empty
    expect(hypoOutput[0].evidenceIds).toHaveLength(0);
  });
});
