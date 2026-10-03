import { Router } from 'express';
import { z } from 'zod';
import { bus } from '../../tracing/events';

export const streamRouter = Router();

/** SSE feed of all events for one user. */
streamRouter.get('/stream', (req, res) => {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(req.query);
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(': connected\n\n');
  const unsubscribe = bus.subscribe((e) => {
    if (e.userId !== userId) return;
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  });
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});
