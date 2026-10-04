import { Router } from 'express';
import { prisma } from '../../db';
import { env } from '../../config/env';
import { OmiStatusQuery } from '../schemas';

export const omiRouter = Router();

const WINDOW_MS = 5 * 60_000;

/**
 * Is the Omi live path actually delivering? Distinguishes real-time Omi segments from simulated ones so a
 * demo can prove the source. `lastRawWebhookAt` also counts payloads we could not parse.
 */
omiRouter.get('/omi/status', async (req, res, next) => {
  try {
    const { userId } = OmiStatusQuery.parse(req.query);
    const since = new Date(Date.now() - WINDOW_MS);
    const where = userId ? { userId } : {};

    const [last, grouped, lastRaw, rawCount] = await Promise.all([
      prisma.transcriptSegment.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, source: true },
      }),
      prisma.transcriptSegment.groupBy({
        by: ['source'],
        where: { ...where, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.rawWebhook.findFirst({
        where: { route: { startsWith: '/webhooks/omi' } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.rawWebhook.count({
        where: { route: { startsWith: '/webhooks/omi' }, createdAt: { gte: since } },
      }),
    ]);

    const counts = { OMI_REALTIME: 0, OMI_MEMORY: 0, SIMULATED: 0 };
    for (const g of grouped) counts[g.source] = g._count._all;

    return res.status(200).json({
      ok: true,
      data: {
        lastSegmentAt: last?.createdAt.toISOString() ?? null,
        lastSegmentSource: last?.source ?? null,
        segmentsLast5Min: counts,
        lastRawWebhookAt: lastRaw?.createdAt.toISOString() ?? null,
        rawWebhooksLast5Min: rawCount,
        webhookSecretConfigured: Boolean(env.OMI_WEBHOOK_SECRET),
      },
    });
  } catch (err) {
    return next(err);
  }
});
