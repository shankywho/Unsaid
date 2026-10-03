import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { prisma } from '../src/db';
import { resetAll, makeUser } from './helpers';
import { upsertMemoryFact } from '../src/memory/memoryStore';
import { env } from '../src/config/env';

describe('Phase 7 — Runs, Memory/Privacy, Simulation, and Debug Console', () => {
  const app = createApp();
  const authHeader = { Authorization: `Bearer ${env.API_KEY}` };

  beforeEach(async () => {
    await resetAll();
  });

  it('serves /debug HTML console', async () => {
    const res = await request(app).get('/debug').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('UNSAID Caregiver & Observability Console');
  });

  it('lists runs and inspects detailed step traces via /v1/runs', async () => {
    const user = await makeUser();

    // Trigger an assist run
    await request(app)
      .post('/v1/simulate/fragment')
      .set(authHeader)
      .send({ userId: user.id, text: 'Sunday Priya cake no' })
      .expect(200);

    // List runs
    const listRes = await request(app).get(`/v1/runs?userId=${user.id}`).set(authHeader).expect(200);

    expect(listRes.body.ok).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThan(0);
    const runId = listRes.body.data[0].id;

    // Get single run trace
    const getRes = await request(app).get(`/v1/runs/${runId}`).set(authHeader).expect(200);

    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.data.id).toBe(runId);
    expect(getRes.body.data.steps.length).toBeGreaterThan(0);
    expect(getRes.body.data.steps.some((s: any) => s.node === 'classify')).toBe(true);
  });

  it('supports memory search, deletion, and purging (privacy controls)', async () => {
    const user = await makeUser();

    // Add facts
    const fact1 = await upsertMemoryFact(user.id, {
      type: 'event',
      text: 'Priya is visiting on Sunday',
      entities: ['Priya', 'Sunday'],
      confidence: 0.95,
    });
    await upsertMemoryFact(user.id, {
      type: 'routine',
      text: 'Evening walk at 6 PM',
      entities: ['walk', '6 PM'],
      confidence: 0.9,
    });

    // List memory facts
    const listRes = await request(app).get(`/v1/memory?userId=${user.id}`).set(authHeader).expect(200);

    expect(listRes.body.ok).toBe(true);
    expect(listRes.body.data.length).toBe(2);

    // Search memory facts with q parameter
    const searchRes = await request(app)
      .get(`/v1/memory?userId=${user.id}&q=Priya`)
      .set(authHeader)
      .expect(200);

    expect(searchRes.body.ok).toBe(true);
    expect(searchRes.body.data.length).toBeGreaterThan(0);
    expect(searchRes.body.data[0].text).toContain('Priya');

    // Delete single memory fact
    await request(app).delete(`/v1/memory/${fact1.id}?userId=${user.id}`).set(authHeader).expect(200);

    const afterDeleteRes = await request(app).get(`/v1/memory?userId=${user.id}`).set(authHeader).expect(200);

    expect(afterDeleteRes.body.data.length).toBe(1);

    // Purge all memory for user
    await request(app).post('/v1/memory/purge').set(authHeader).send({ userId: user.id }).expect(200);

    const afterPurgeRes = await request(app).get(`/v1/memory?userId=${user.id}`).set(authHeader).expect(200);

    expect(afterPurgeRes.body.data.length).toBe(0);
  });

  it('handles simulated ambient segments via /v1/simulate/segments', async () => {
    const user = await makeUser();

    const simRes = await request(app)
      .post('/v1/simulate/segments')
      .set(authHeader)
      .send({
        userId: user.id,
        segments: [{ speaker: 'Sunita', text: 'Dr. Mehta visited today.', isUser: false }],
      })
      .expect(200);

    expect(simRes.body.ok).toBe(true);
    expect(simRes.body.processed).toBe(1);

    const stored = await prisma.transcriptSegment.findMany({ where: { userId: user.id } });
    expect(stored.length).toBe(1);
    expect(stored[0].source).toBe('SIMULATED');
  });
});
