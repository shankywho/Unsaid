import { useEffect, useRef, useState } from 'react';
import type { EventEnvelope } from '../api/client';

export const EVENT_TYPES = [
  'segment.received',
  'segment.classified',
  'hypotheses.generated',
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

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'idle';

/**
 * One SSE connection per patient. EventSource reconnects by itself for network blips, but gives up on HTTP
 * errors (for example an expired session), so we close and reopen with exponential backoff (1s -> 15s).
 * `onReconnect` fires after a re-established connection so callers can refetch state (events are not replayed).
 */
export function useEventStream(
  userId: string | undefined,
  onEvent: (e: EventEnvelope) => void,
  onReconnect?: () => void,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const handler = useRef(onEvent);
  const reconnect = useRef(onReconnect);
  handler.current = onEvent;
  reconnect.current = onReconnect;

  useEffect(() => {
    if (!userId) {
      setStatus('idle');
      return;
    }
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let everOpened = false;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      setStatus(everOpened ? 'reconnecting' : 'connecting');
      es = new EventSource(`/v1/stream?userId=${encodeURIComponent(userId)}`, { withCredentials: true });
      es.onopen = () => {
        const wasReconnect = everOpened;
        everOpened = true;
        attempt = 0;
        setStatus('open');
        if (wasReconnect) reconnect.current?.();
      };
      es.onerror = () => {
        if (!es || disposed) return;
        setStatus('reconnecting');
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          timer = setTimeout(open, delay);
        }
      };
      for (const t of EVENT_TYPES) {
        es.addEventListener(t, (m) => {
          try {
            handler.current(JSON.parse((m as MessageEvent).data) as EventEnvelope);
          } catch {
            /* ignore malformed frame */
          }
        });
      }
    };
    open();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [userId]);

  return status;
}
