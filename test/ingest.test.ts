import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { prisma } from '../src/db';
import { resetAll, makeUser } from './helpers';
import {
  upsertMemoryFact,
  searchMemory,
  computeRecencyScore,
  rerankMemoryHit,
} from '../src/memory/memoryStore';
import { flushBufferDirect } from '../src/queues/ingestQueue';
import { qdrant } from '../src/adapters/qdrant/client';

describe('Phase 4 — Ingest, Memory Store, and Omi Webhooks', () => {
  const app = createApp();

  beforeEach(async () => {
    await resetAll();
  });

  describe('Multi-tenant safety & Memory store unit tests', () => {
    it('verifies searchMemory and upsert always enforce userId filter', async () => {
      const querySpy = vi.spyOn(qdrant, 'query');
      const user = await makeUser({ omiUid: 'omi_user_safe' });

      await searchMemory(user.id, ['test query']);

      expect(querySpy).toHaveBeenCalled();
      const lastCallArgs = querySpy.mock.calls[querySpy.mock.calls.length - 1];
      const filter = (lastCallArgs[1] as any)?.filter;

      expect(filter).toBeDefined();
      expect(filter.must).toBeDefined();
      const userClause = filter.must.find((c: any) => c.key === 'userId' && c.match?.value === user.id);
      expect(userClause).toBeDefined();
      querySpy.mockRestore();
    });

    it('deduplicates facts with score >= 0.92 and merges entities/mentions', async () => {
      const user = await makeUser();

      const fact1 = await upsertMemoryFact(user.id, {
        type: 'event',
        text: 'Priya is visiting on Sunday',
        entities: ['Priya', 'Sunday'],
        aliases: ['beti'],
        confidence: 0.85,
      });

      expect(fact1.merged).toBe(false);
      expect(fact1.payload.mentions).toBe(1);

      // Upsert near-duplicate fact
      const fact2 = await upsertMemoryFact(user.id, {
        type: 'event',
        text: 'Priya is visiting on Sunday',
        entities: ['Priya', 'weekend'],
        aliases: ['Pri'],
        confidence: 0.95,
      });

      expect(fact2.merged).toBe(true);
      expect(fact2.payload.mentions).toBe(2);
      expect(fact2.payload.confidence).toBe(0.95);
      expect(fact2.payload.entities).toContain('Sunday');
      expect(fact2.payload.entities).toContain('weekend');
      expect(fact2.payload.aliases).toContain('beti');
      expect(fact2.payload.aliases).toContain('Pri');
    });

    it('correctly calculates recency score decay and drops expired facts', async () => {
      const freshScore = computeRecencyScore(new Date().toISOString());
      expect(freshScore).toBeCloseTo(1.0, 1);

      // 7 days ago should decay by ~0.5
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const decayedScore = computeRecencyScore(sevenDaysAgo);
      expect(decayedScore).toBeCloseTo(0.5, 1);

      const rerank = rerankMemoryHit(0.9, new Date().toISOString(), 3);
      expect(rerank).toBeGreaterThan(0.9 * 0.7);

      const user = await makeUser();
      // Insert already expired fact
      await upsertMemoryFact(user.id, {
        type: 'event',
        text: 'Doctor appointment yesterday',
        entities: ['doctor'],
        validUntil: new Date(Date.now() - 3600_000).toISOString(),
        confidence: 0.9,
      });

      const hits = await searchMemory(user.id, ['doctor']);
      expect(hits.length).toBe(0);
    });
  });

  describe('Omi Webhooks & Ingestion Integration', () => {
    it('Integration Test 1: Omi transcript webhook with ambient segments buffers and flushes to Qdrant facts', async () => {
      const user = await makeUser({ omiUid: 'omi_mohan_123' });

      // Ambient segments spoken by household members
      const payload = {
        session_id: 'sess_week_1',
        segments: [
          {
            speaker: 'Ramesh',
            text: 'Priya is visiting us this Sunday.',
            is_user: false,
            start: 1.0,
            end: 3.5,
          },
          {
            speaker: 'Sunita',
            text: 'Dr. Mehta said Papa must avoid sugar and sweets.',
            is_user: false,
            start: 4.0,
            end: 7.0,
          },
        ],
      };

      const res = await request(app)
        .post(`/webhooks/omi/transcript?uid=omi_mohan_123`)
        .send(payload)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.received).toBe(2);

      // Verify segments stored in database with dedupe key
      const storedSegments = await prisma.transcriptSegment.findMany({
        where: { userId: user.id },
      });
      expect(storedSegments).toHaveLength(2);
      expect(storedSegments[0].dedupeKey).toBeDefined();

      // Flush buffered segments to execute ingest pipeline
      const flushedCount = await flushBufferDirect(user.id, 'sess_week_1');
      expect(flushedCount).toBe(2);

      // Check that facts exist in Qdrant and can be retrieved
      const hits = await searchMemory(user.id, ['Priya Sunday', 'sugar restriction']);
      expect(hits.length).toBeGreaterThan(0);
      expect(
        hits.some((h) => h.text.toLowerCase().includes('priya') || h.text.toLowerCase().includes('sugar')),
      ).toBe(true);

      // Verify Run and Step were recorded
      const runs = await prisma.run.findMany({ where: { userId: user.id, pipeline: 'INGEST' } });
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('SUCCEEDED');
    });

    it('Integration Test 6: Malformed webhook returns 200 and records in RawWebhook', async () => {
      const malformedPayload = { unexpected_key: { nested: 12345 } };

      const res = await request(app)
        .post('/webhooks/omi/transcript?uid=unknown_uid')
        .send(malformedPayload)
        .expect(200);

      expect(res.body.ok).toBe(true);

      const raw = await prisma.rawWebhook.findFirst({
        where: { route: '/webhooks/omi/transcript' },
        orderBy: { createdAt: 'desc' },
      });

      expect(raw).toBeDefined();
      expect(raw?.query).toMatchObject({ uid: 'unknown_uid' });
    });
  });
});
