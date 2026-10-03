import { Router } from 'express';
import { prisma } from '../../db';

export const runsRouter = Router();

runsRouter.get('/runs', async (req, res, next) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const pipeline = typeof req.query.pipeline === 'string' ? (req.query.pipeline as any) : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const runs = await prisma.run.findMany({
      where: {
        userId,
        pipeline,
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        _count: {
          select: { steps: true },
        },
      },
    });

    return res.status(200).json({ ok: true, data: runs });
  } catch (err) {
    return next(err);
  }
});

runsRouter.get('/runs/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const run = await prisma.run.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { startedAt: 'asc' },
        },
        user: {
          select: { id: true, displayName: true, contextEnabled: true, assistMode: true },
        },
      },
    });

    if (!run) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run trace not found' } });
    }

    return res.status(200).json({ ok: true, data: run });
  } catch (err) {
    return next(err);
  }
});
