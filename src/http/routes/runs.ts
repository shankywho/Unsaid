import { Router } from 'express';
import { prisma } from '../../db';
import { notFound } from '../../lib/errors';
import { IdParams, RunsQuery } from '../schemas';

export const runsRouter = Router();

runsRouter.get('/runs', async (req, res, next) => {
  try {
    const { userId, pipeline, limit } = RunsQuery.parse(req.query);
    const runs = await prisma.run.findMany({
      where: { userId, pipeline },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { _count: { select: { steps: true } } },
    });
    return res.status(200).json({ ok: true, data: runs });
  } catch (err) {
    return next(err);
  }
});

runsRouter.get('/runs/:id', async (req, res, next) => {
  try {
    const { id } = IdParams.parse(req.params);
    const run = await prisma.run.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { startedAt: 'asc' } },
        user: { select: { id: true, displayName: true, contextEnabled: true, assistMode: true } },
      },
    });
    if (!run) throw notFound('Run trace');
    return res.status(200).json({ ok: true, data: run });
  } catch (err) {
    return next(err);
  }
});
