import { Router } from 'express';
import { runAssistPipeline } from '../../orchestrator/assistPipeline';
import { bufferSegment } from '../../queues/ingestQueue';
import { prisma } from '../../db';
import { newId } from '../../lib/ids';
import { notFound } from '../../lib/errors';
import { bus } from '../../tracing/events';
import { recordSegment } from '../../ingest/recordSegment';
import { SimulateFragmentBody, SimulateSegmentsBody } from '../schemas';

export const simulateRouter = Router();

async function requireUser(userId: string): Promise<void> {
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })))
    throw notFound('User');
}

simulateRouter.post('/simulate/fragment', async (req, res, next) => {
  try {
    const { userId, text } = SimulateFragmentBody.parse(req.body);
    await requireUser(userId);
    const result = await runAssistPipeline({ userId, text, source: 'SIMULATED' });
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    return next(err);
  }
});

simulateRouter.post('/simulate/segments', async (req, res, next) => {
  try {
    const { userId, segments, sessionId = newId() } = SimulateSegmentsBody.parse(req.body);
    await requireUser(userId);

    let duplicates = 0;
    for (const seg of segments) {
      const text = seg.text.trim();
      if (!text) continue;
      const isUser = Boolean(seg.isUser);

      const { created, dedupeKey } = await recordSegment({
        userId,
        sessionId,
        text,
        speaker: seg.speaker,
        isUser,
        start: seg.start,
        end: seg.end,
        source: 'SIMULATED',
      });
      if (!created) {
        duplicates++;
        continue;
      }

      bus.publish('segment.received', userId, {
        segmentId: dedupeKey,
        isUser,
        sessionId,
        source: 'SIMULATED',
        textLength: text.length,
        text,
      });

      if (isUser) {
        await runAssistPipeline({ userId, text, sessionId, source: 'SIMULATED' });
      } else {
        await bufferSegment(userId, sessionId, {
          text,
          speaker: seg.speaker,
          id: dedupeKey,
          startSec: seg.start,
          endSec: seg.end,
        });
      }
    }

    return res.status(200).json({ ok: true, processed: segments.length, duplicates });
  } catch (err) {
    return next(err);
  }
});
