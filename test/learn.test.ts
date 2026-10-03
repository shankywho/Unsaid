import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { prisma } from '../src/db';
import { resetAll, makeUser } from './helpers';
import { runLearnPipeline } from '../src/orchestrator/learnPipeline';
import { searchWordMap } from '../src/memory/wordMap';
import { env } from '../src/config/env';

describe('Phase 6 — LEARN pipeline and WordMap feedback loop', () => {
  const app = createApp();
  const authHeader = { Authorization: `Bearer ${env.API_KEY}` };

  beforeEach(async () => {
    await resetAll();
  });

  it('Integration Test 4: Learning loop — 2nd identical fragment gets confirmed intent as hypothesis #1', async () => {
    const user = await makeUser({ displayName: 'Mohan' });
    const fragment = 'car park six';
    const confirmedSentence = 'Time for evening walk in the park at six.';

    // 1. Execute learning directly for this fragment & confirmed sentence
    await runLearnPipeline({
      userId: user.id,
      fragment,
      confirmedSentence,
      rejectedHypotheses: ['I want to drive my car to the park.'],
    });

    // Verify wordmap has the resolved utterance and substitution
    const hits = await searchWordMap(user.id, fragment);
    expect(hits.length).toBeGreaterThan(0);
    const resolvedHit = hits.find((h) => h.kind === 'resolved_utterance');
    expect(resolvedHit).toBeDefined();
    expect(resolvedHit?.resolvedSentence).toBe(confirmedSentence);

    // Verify substitution mirrored to Postgres WordMapEntry
    const entries = await prisma.wordMapEntry.findMany({ where: { userId: user.id } });
    expect(entries.some((e) => e.saidToken === 'car' && e.meantToken === 'walk')).toBe(true);

    // Verify GET /v1/users/:id/wordmap endpoint
    const getRes = await request(app)
      .get(`/v1/users/${user.id}/wordmap`)
      .set(authHeader)
      .expect(200);

    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.data.substitutions.length).toBeGreaterThan(0);
    expect(getRes.body.data.resolvedUtterances.length).toBeGreaterThan(0);

    // 2. Patient speaks the exact same fragment again
    const secondFragRes = await request(app)
      .post('/v1/simulate/fragment')
      .set(authHeader)
      .send({
        userId: user.id,
        text: fragment,
      })
      .expect(200);

    const { confirmationId } = secondFragRes.body.data;
    const confirmation = await prisma.confirmation.findUnique({
      where: { id: confirmationId },
    });

    expect(confirmation).toBeDefined();
    const hypotheses = confirmation?.hypotheses as any[];
    expect(hypotheses).toBeDefined();
    expect(hypotheses.length).toBeGreaterThan(0);

    // Hypothesis #1 MUST be the previously confirmed sentence!
    const topHypothesis = hypotheses[0];
    expect(topHypothesis.sentence).toBe(confirmedSentence);
    expect(topHypothesis.confidence).toBeGreaterThan(0.85);
  });
});
