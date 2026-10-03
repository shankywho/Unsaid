import { Router } from 'express';
import { z } from 'zod';
import { runAssistPipeline } from '../../orchestrator/assistPipeline';
import { bufferSegment } from '../../queues/ingestQueue';
import { prisma } from '../../db';
import { sha1, newId } from '../../lib/ids';
import { bus } from '../../tracing/events';

export const simulateRouter = Router();

const fragmentSchema = z.object({
  userId: z.string(),
  text: z.string(),
});

const segmentsSchema = z.object({
  userId: z.string(),
  sessionId: z.string().optional(),
  segments: z.array(
    z.object({
      text: z.string(),
      isUser: z.boolean().default(false),
      speaker: z.string().nullish(),
      start: z.number().nullish(),
      end: z.number().nullish(),
    }),
  ),
});

simulateRouter.post('/simulate/fragment', async (req, res, next) => {
  try {
    const { userId, text } = fragmentSchema.parse(req.body);
    const result = await runAssistPipeline({
      userId,
      text,
      source: 'SIMULATED',
    });
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    return next(err);
  }
});

simulateRouter.post('/simulate/segments', async (req, res, next) => {
  try {
    const { userId, segments, sessionId = newId() } = segmentsSchema.parse(req.body);

    for (const seg of segments) {
      const text = seg.text.trim();
      if (!text) continue;
      const dedupeKey = sha1(`${sessionId}|${seg.start ?? ''}|${text}`);
      const isUser = Boolean(seg.isUser);

      await prisma.transcriptSegment.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        create: {
          userId,
          sessionId,
          text,
          speaker: seg.speaker ?? (isUser ? 'PATIENT' : 'OTHER'),
          isUser,
          startSec: seg.start ?? null,
          endSec: seg.end ?? null,
          source: 'SIMULATED',
          kind: isUser ? 'FRAGMENT' : 'AMBIENT',
          dedupeKey,
        },
        update: {},
      });

      bus.publish('segment.received', userId, { text, isUser, sessionId });

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

    return res.status(200).json({ ok: true, processed: segments.length });
  } catch (err) {
    return next(err);
  }
});
