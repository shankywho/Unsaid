import fs from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app';
import { env } from '../src/config/env';
import { bus, EVENT_TYPES, type EventEnvelope, type EventType } from '../src/tracing/events';
import { runLearnPipeline } from '../src/orchestrator/learnPipeline';
import { EventEnvelopeSchema } from '../src/http/schemas';
import { resetAll, makeUser } from './helpers';
import { sweepExpiredConfirmations } from '../src/queues/cleanupQueue';
import { redis } from '../src/redis';
import { pendingKey } from '../src/confirmations/service';

const bearer = { Authorization: `Bearer ${env.API_KEY}` };

/** The ASSIST event lifecycle documented in docs/FRONTEND_CONTRACT.md. */
describe('Phase C — SSE event contract', () => {
  const app = createApp();
  beforeEach(async () => {
    await resetAll();
  });

  it('emits the documented ASSIST lifecycle in order, then LEARN events after a confirmation', async () => {
    const user = await makeUser();
    const events: EventEnvelope[] = [];
    const off = bus.subscribe((e) => {
      if (e.userId === user.id) events.push(e);
    });

    // ambient context -> memory.upserted
    await request(app)
      .post('/v1/simulate/segments')
      .set(bearer)
      .send({
        userId: user.id,
        sessionId: 's1',
        segments: [
          { text: 'Ramesh said he will pay the water bill on Friday.', isUser: false },
          { text: 'Priya is coming on Sunday with cake.', isUser: false },
        ],
      });
    const { flushBufferDirect } = await import('../src/queues/ingestQueue');
    await flushBufferDirect(user.id, 's1');

    const frag = await request(app)
      .post('/v1/simulate/fragment')
      .set(bearer)
      .send({ userId: user.id, text: 'water… Ramesh… bill' });
    const confId: string = frag.body.data.confirmationId;
    expect(confId).toBeTruthy();

    const no = await request(app)
      .post(`/v1/confirmations/${confId}/answer`)
      .set(bearer)
      .send({ answer: 'no' });
    expect(no.status).toBe(200);
    const yes = await request(app)
      .post(`/v1/confirmations/${confId}/answer`)
      .set(bearer)
      .send({ answer: 'yes' });
    expect(yes.body.data.resolved).toBe(true);

    const conf = (await request(app).get(`/v1/confirmations/${confId}`).set(bearer)).body.data;
    await runLearnPipeline({
      userId: user.id,
      fragment: conf.fragment,
      confirmedSentence: conf.finalSentence,
      runId: conf.runId,
    });
    off();

    // every event conforms to the documented envelope and a known type
    for (const e of events) {
      expect(() => EventEnvelopeSchema.parse(e)).not.toThrow();
      expect(EVENT_TYPES).toContain(e.type);
    }

    const assistRunId = frag.body.data.runId as string;
    const assist = events.filter((e) => e.runId === assistRunId).map((e) => e.type);
    const first = (t: EventType) => assist.indexOf(t);

    // run.started < classified < hypotheses < asked < answered(no) < asked < answered(yes) < resolved
    expect(first('run.started')).toBe(0);
    expect(first('segment.classified')).toBeGreaterThan(first('run.started'));
    expect(first('hypotheses.generated')).toBeGreaterThan(first('segment.classified'));
    expect(first('confirmation.asked')).toBeGreaterThan(first('hypotheses.generated'));
    expect(assist.filter((t) => t === 'confirmation.answered')).toHaveLength(2);
    expect(assist.filter((t) => t === 'confirmation.asked')).toHaveLength(2); // initial + after "no"
    expect(assist.lastIndexOf('assist.resolved')).toBeGreaterThan(
      assist.lastIndexOf('confirmation.answered'),
    );
    // every started step ends exactly once
    const started = events.filter((e) => e.runId === assistRunId && e.type === 'step.started').length;
    const ended = events.filter(
      (e) => e.runId === assistRunId && /^step\.(completed|failed)$/.test(e.type),
    ).length;
    expect(ended).toBe(started);

    // step.completed carries latency; retrieval nodes carry hits with scores
    const mem = events.find(
      (e) => e.runId === assistRunId && e.type === 'step.completed' && e.data.node === 'retrieve_memory',
    );
    expect(typeof mem?.data.latencyMs).toBe('number');
    expect(Array.isArray(mem?.data.retrieval)).toBe(true);
    expect((mem!.data.retrieval as Array<{ score: number }>)[0]?.score).toBeGreaterThan(0);

    const hyp = events.find((e) => e.type === 'hypotheses.generated')!;
    expect((hyp.data.hypotheses as unknown[]).length).toBeGreaterThanOrEqual(1);

    const types = new Set(events.map((e) => e.type));
    for (const t of [
      'segment.received',
      'memory.upserted',
      'wordmap.updated',
      'run.completed',
      'step.started',
      'step.completed',
    ]) {
      expect(types.has(t as EventType), `missing event ${t}`).toBe(true);
    }

    if (process.env.DUMP_EVENTS) fs.writeFileSync(process.env.DUMP_EVENTS, JSON.stringify(events, null, 2));
  }, 60_000);

  it('expires an unanswered confirmation after its deadline (timeout sweep) and emits confirmation.expired', async () => {
    const user = await makeUser();
    const events: EventEnvelope[] = [];
    const off = bus.subscribe((e) => {
      if (e.userId === user.id) events.push(e);
    });
    const frag = await request(app)
      .post('/v1/simulate/fragment')
      .set(bearer)
      .send({ userId: user.id, text: 'tea… cup… morning' });
    const confId: string = frag.body.data.confirmationId;

    // still within the deadline: nothing happens
    expect((await sweepExpiredConfirmations()).expired).toBe(0);

    await redis.del(pendingKey(user.id)); // simulate the TTL lapsing
    expect((await sweepExpiredConfirmations()).expired).toBe(1);
    off();

    const conf = (await request(app).get(`/v1/confirmations/${confId}`).set(bearer)).body.data;
    expect(conf.status).toBe('EXPIRED');
    expect(conf.resolution).toBe('timeout');
    expect(events.find((e) => e.type === 'confirmation.expired')?.data).toMatchObject({
      confirmationId: confId,
      reason: 'timeout',
    });
    const run = (await request(app).get(`/v1/runs/${conf.runId}`).set(bearer)).body.data;
    expect(run.status).toBe('FAILED');
  });
});
