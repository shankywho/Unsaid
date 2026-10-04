import { stepService } from '../../tracing/services';
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
    const t0 = run.startedAt.getTime();
    const steps = run.steps.map((s) => ({
      ...s,
      startOffsetMs: Math.max(0, s.startedAt.getTime() - t0),
      service: stepService(s.node, s.agentId),
    }));
    return res.status(200).json({ ok: true, data: { ...run, steps } });
  } catch (err) {
    return next(err);
  }
});
