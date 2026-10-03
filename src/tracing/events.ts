import { EventEmitter } from 'node:events';
import { newId } from '../lib/ids';
import { logger } from '../lib/logger';
import { createRedis, redis } from '../redis';

export const EVENT_TYPES = [
  'segment.received',
  'segment.classified',
  'run.started',
  'step.started',
  'step.completed',
  'step.failed',
  'memory.upserted',
  'confirmation.asked',
  'confirmation.answered',
  'assist.resolved',
  'assist.unresolved',
  'confirmation.expired',
  'wordmap.updated',
  'run.completed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventEnvelope {
  type: EventType;
  userId: string;
  runId?: string;
  ts: string;
  data: Record<string, unknown>;
}

const CHANNEL = 'unsaid:events';
const ORIGIN = newId(); // lets a process ignore its own Redis echo

interface Wire {
  origin: string;
  event: EventEnvelope;
}

/**
 * In-process emitter + Redis pub/sub, so BullMQ workers (possibly other processes)
 * can publish and the API process can stream to SSE clients.
 */
class EventBus {
  private emitter = new EventEmitter().setMaxListeners(0);
  private sub?: ReturnType<typeof createRedis>;

  publish(
    type: EventType,
    userId: string,
    data: Record<string, unknown> = {},
    runId?: string,
  ): EventEnvelope {
    const event: EventEnvelope = { type, userId, runId, ts: new Date().toISOString(), data };
    this.emitter.emit('event', event);
    const wire: Wire = { origin: ORIGIN, event };
    redis.publish(CHANNEL, JSON.stringify(wire)).catch((err) => logger.warn({ err }, 'event publish failed'));
    return event;
  }

  /** Subscribe to everything (all users). Returns an unsubscribe fn. */
  subscribe(fn: (e: EventEnvelope) => void): () => void {
    this.emitter.on('event', fn);
    return () => this.emitter.off('event', fn);
  }

  /** Start relaying events published by other processes into the local emitter. */
  async startRelay(): Promise<void> {
    if (this.sub) return;
    this.sub = createRedis();
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_ch, raw) => {
      try {
        const wire = JSON.parse(raw) as Wire;
        if (wire.origin !== ORIGIN) this.emitter.emit('event', wire.event);
      } catch {
        /* ignore malformed */
      }
    });
  }

  async stopRelay(): Promise<void> {
    await this.sub?.quit().catch(() => undefined);
    this.sub = undefined;
  }
}

export const bus = new EventBus();
