import { Router } from 'express';
import { bus } from '../../tracing/events';
import { sseClients } from '../../lib/shutdown';
import { StreamQuery } from '../schemas';

export const streamRouter = Router();

/** SSE feed of all events for one user. */
streamRouter.get('/stream', (req, res, next) => {
  const parsed = StreamQuery.safeParse(req.query);
  if (!parsed.success) return next(parsed.error);
  const { userId } = parsed.data;
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 3000\n: connected\n\n');
  sseClients.add(res);
  const unsubscribe = bus.subscribe((e) => {
    if (e.userId !== userId) return;
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  });
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
    unsubscribe();
  });
});
