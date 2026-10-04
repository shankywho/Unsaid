import { Router } from 'express';
import { prisma } from '../../db';
import { qdrant } from '../../adapters/qdrant/client';
import { collections } from '../../adapters/qdrant/collections';
import { notFound } from '../../lib/errors';
import { CreateUserBody, IdParams, UpdateUserBody } from '../schemas';

export const usersRouter = Router();

usersRouter.post('/users', async (req, res, next) => {
  try {
    const body = CreateUserBody.parse(req.body);
    const user = await prisma.user.create({
      data: body,
    });
    return res.status(201).json({ ok: true, data: user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = IdParams.parse(req.params);
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { segments: true, runs: true, confirmations: true, wordMapEntries: true },
        },
      },
    });

    if (!user) throw notFound('User');

    return res.status(200).json({ ok: true, data: user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const { id } = IdParams.parse(req.params);
    const body = UpdateUserBody.parse(req.body);
    const user = await prisma.user.update({ where: { id }, data: body }); // P2025 -> 404 in errorHandler
    return res.status(200).json({ ok: true, data: user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get('/users/:id/wordmap', async (req, res, next) => {
  try {
    const { id: userId } = IdParams.parse(req.params);

    // Fetch entries from relational DB
    const entries = await prisma.wordMapEntry.findMany({
      where: { userId },
      orderBy: { hits: 'desc' },
    });

    // Fetch resolved utterances from Qdrant
    let resolvedUtterances: any[] = [];
    try {
      const qdrantPoints = await qdrant.scroll(collections.wordmap, {
        filter: {
          must: [
            { key: 'userId', match: { value: userId } },
            { key: 'kind', match: { value: 'resolved_utterance' } },
          ],
        },
        limit: 50,
        with_payload: true,
      });

      resolvedUtterances = (qdrantPoints.points || []).map((p) => ({
        id: p.id,
        ...(p.payload || {}),
      }));
    } catch {
      // Ignore if qdrant collection is empty or not yet seeded
    }

    return res.status(200).json({
      ok: true,
      data: {
        substitutions: entries,
        resolvedUtterances,
      },
    });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get('/users/:id/insights', async (req, res, next) => {
  try {
    const { id: userId } = IdParams.parse(req.params);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('User');

    const [fragmentsCount, totalConfirmations, confirmedCount, firstTryCount, topSubstitutions] =
      await Promise.all([
        prisma.transcriptSegment.count({
          where: { userId, isUser: true },
        }),
        prisma.confirmation.count({
          where: { userId },
        }),
        prisma.confirmation.count({
          where: { userId, status: 'CONFIRMED' },
        }),
        prisma.confirmation.count({
          where: { userId, status: 'CONFIRMED', confirmedIdx: 0 },
        }),
        prisma.wordMapEntry.findMany({
          where: { userId },
          orderBy: { hits: 'desc' },
          take: 5,
        }),
      ]);

    const firstTryResolutionRate =
      confirmedCount > 0 ? Number((firstTryCount / confirmedCount).toFixed(2)) : 0;
    const overallResolutionRate =
      totalConfirmations > 0 ? Number((confirmedCount / totalConfirmations).toFixed(2)) : 0;

    return res.status(200).json({
      ok: true,
      data: {
        userId,
        displayName: user.displayName,
        stats: {
          fragmentsCount,
          totalConfirmations,
          confirmedCount,
          firstTryCount,
          firstTryResolutionRate,
          overallResolutionRate,
        },
        topSubstitutions,
      },
    });
  } catch (err) {
    return next(err);
  }
});
