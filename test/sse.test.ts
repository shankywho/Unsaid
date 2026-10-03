import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app';
import { bus } from '../src/tracing/events';
import { redis } from '../src/redis';
import { prisma } from '../src/db';
import { sleep } from '../src/lib/time';

const server = createApp().listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

beforeAll(async () => {
  await bus.startRelay();
});
afterAll(async () => {
  server.close();
  await bus.stopRelay();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('SSE stream', () => {
  it('requires auth', async () => {
    const res = await fetch(`${base()}/v1/stream?userId=u1`);
    expect(res.status).toBe(401);
  });

  it('streams only the subscribed user’s events', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base()}/v1/stream?userId=u1&api_key=test-key`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    await sleep(100);
    bus.publish('step.started', 'other-user', { node: 'nope' }, 'r0');
    bus.publish('step.completed', 'u1', { node: 'classify', latencyMs: 5 }, 'r1');
    let buf = '';
    const dec = new TextDecoder();
    const deadline = Date.now() + 3000;
    while (!buf.includes('step.completed') && Date.now() < deadline) {
      const { value } = await reader.read();
      buf += dec.decode(value);
    }
    ctrl.abort();
    expect(buf).toContain('event: step.completed');
    expect(buf).toContain('"runId":"r1"');
    expect(buf).not.toContain('nope');
  });

  it('relays events published by other processes via Redis', async () => {
    const got: string[] = [];
    const off = bus.subscribe((e) => got.push(e.type));
    await redis.publish(
      'unsaid:events',
      JSON.stringify({
        origin: 'another-process',
        event: { type: 'memory.upserted', userId: 'u', ts: 'x', data: {} },
      }),
    );
    await sleep(200);
    off();
    expect(got).toContain('memory.upserted');
  });
});
