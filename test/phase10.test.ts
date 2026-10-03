import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { prisma } from '../src/db';
import { resetAll, makeUser } from './helpers';
import { runRetentionCleanup } from '../src/queues/cleanupQueue';
import { env } from '../src/config/env';

describe('Phase 10 — Stretch features (Insights & Retention Cleanup)', () => {
  const app = createApp();
  const authHeader = { Authorization: `Bearer ${env.API_KEY}` };

  beforeEach(async () => {
    await resetAll();
  });

  it('calculates weekly insights via /v1/users/:id/insights', async () => {
    const user = await makeUser({ displayName: 'Mohan' });

    // Seed some fragments and confirmations
    await prisma.transcriptSegment.create({
      data: {
        userId: user.id,
        sessionId: 'sess_1',
        text: 'Sunday Priya cake no',
        isUser: true,
        source: 'SIMULATED',
        dedupeKey: 'key_1',
      },
    });

    await prisma.confirmation.create({
      data: {
        userId: user.id,
        runId: 'run_conf_1',
        fragment: 'Sunday Priya cake no',
        hypotheses: [],
        question: 'Do you mean cake?',
        status: 'CONFIRMED',
        confirmedIdx: 0,
      },
    });

    const res = await request(app).get(`/v1/users/${user.id}/insights`).set(authHeader).expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.data.stats.fragmentsCount).toBe(1);
    expect(res.body.data.stats.confirmedCount).toBe(1);
    expect(res.body.data.stats.firstTryCount).toBe(1);
    expect(res.body.data.stats.firstTryResolutionRate).toBe(1);
  });

  it('cleans up raw ambient transcripts past retention days', async () => {
    const user = await makeUser();

    // 15 days ago segment (should be cleaned up)
    const oldDate = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
    await prisma.transcriptSegment.create({
      data: {
        userId: user.id,
        sessionId: 'old_sess',
        text: 'ambient old',
        isUser: false,
        source: 'OMI_REALTIME',
        dedupeKey: 'old_key',
        createdAt: oldDate,
      },
    });

    // Recent ambient segment (should be kept)
    await prisma.transcriptSegment.create({
      data: {
        userId: user.id,
        sessionId: 'new_sess',
        text: 'ambient fresh',
        isUser: false,
        source: 'OMI_REALTIME',
        dedupeKey: 'fresh_key',
      },
    });

    const cleanupResult = await runRetentionCleanup();
    expect(cleanupResult.deleted).toBe(1);

    const remaining = await prisma.transcriptSegment.findMany({ where: { userId: user.id } });
    expect(remaining.length).toBe(1);
    expect(remaining[0].dedupeKey).toBe('fresh_key');
  });
});
