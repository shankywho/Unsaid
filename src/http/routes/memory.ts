import { Router } from 'express';
import { z } from 'zod';
import { qdrant } from '../../adapters/qdrant/client';
import { collections } from '../../adapters/qdrant/collections';
import { searchMemory, deleteMemoryFact, purgeUserMemory } from '../../memory/memoryStore';

export const memoryRouter = Router();

const purgeSchema = z.object({
  userId: z.string().min(1),
});

memoryRouter.get('/memory', async (req, res, next) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    if (!userId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'userId query param required' } });
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;

    if (q) {
      const hits = await searchMemory(userId, [q]);
      const filtered = type ? hits.filter((h) => h.type === type) : hits;
      return res.status(200).json({ ok: true, data: filtered });
    }

    // List memory facts from Qdrant via scroll
    const mustFilters: any[] = [{ key: 'userId', match: { value: userId } }];
    if (type) {
      mustFilters.push({ key: 'type', match: { value: type } });
    }

    const scrollRes = await qdrant.scroll(collections.memory, {
      filter: { must: mustFilters },
      limit: 50,
      with_payload: true,
    });

    const facts = (scrollRes.points || []).map((p) => ({
      id: String(p.id),
      ...(p.payload || {}),
    }));

    return res.status(200).json({ ok: true, data: facts });
  } catch (err) {
    return next(err);
  }
});

memoryRouter.delete('/memory/:pointId', async (req, res, next) => {
  try {
    const { pointId } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    if (!userId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'userId query param required' } });
    }

    await deleteMemoryFact(userId, pointId);
    return res.status(200).json({ ok: true, deleted: pointId });
  } catch (err) {
    return next(err);
  }
});

memoryRouter.post('/memory/purge', async (req, res, next) => {
  try {
    const { userId } = purgeSchema.parse(req.body);
    await purgeUserMemory(userId);
    return res.status(200).json({ ok: true, purged: true, userId });
  } catch (err) {
    return next(err);
  }
});
