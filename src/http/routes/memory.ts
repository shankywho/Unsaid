import { Router } from 'express';
import { qdrant } from '../../adapters/qdrant/client';
import { collections } from '../../adapters/qdrant/collections';
import { searchMemory, deleteMemoryFact, purgeUserMemory } from '../../memory/memoryStore';
import { MemoryDeleteQuery, MemoryListQuery, PointIdParams, PurgeBody } from '../schemas';

export const memoryRouter = Router();

memoryRouter.get('/memory', async (req, res, next) => {
  try {
    const { userId, q: rawQ, type } = MemoryListQuery.parse(req.query);
    const q = rawQ?.trim() ?? '';

    if (q) {
      const hits = await searchMemory(userId, [q]);
      const filtered = type ? hits.filter((h) => h.type === type) : hits;
      return res.status(200).json({ ok: true, data: filtered });
    }

    const mustFilters: Array<{ key: string; match: { value: string } }> = [
      { key: 'userId', match: { value: userId } },
    ];
    if (type) mustFilters.push({ key: 'type', match: { value: type } });

    const scrollRes = await qdrant.scroll(collections.memory, {
      filter: { must: mustFilters },
      limit: 50,
      with_payload: true,
    });

    const facts = (scrollRes.points || []).map((p) => ({ id: String(p.id), ...(p.payload || {}) }));
    return res.status(200).json({ ok: true, data: facts });
  } catch (err) {
    return next(err);
  }
});

memoryRouter.delete('/memory/:pointId', async (req, res, next) => {
  try {
    const { pointId } = PointIdParams.parse(req.params);
    const { userId } = MemoryDeleteQuery.parse(req.query);
    await deleteMemoryFact(userId, pointId);
    return res.status(200).json({ ok: true, deleted: pointId });
  } catch (err) {
    return next(err);
  }
});

memoryRouter.post('/memory/purge', async (req, res, next) => {
  try {
    const { userId } = PurgeBody.parse(req.body);
    await purgeUserMemory(userId);
    return res.status(200).json({ ok: true, purged: true, userId });
  } catch (err) {
    return next(err);
  }
});
