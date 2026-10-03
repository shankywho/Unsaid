import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { answerConfirmation } from '../../confirmations/service';

export const confirmationsRouter = Router();

const answerSchema = z.object({
  answer: z.enum(['yes', 'no']),
});

confirmationsRouter.post('/confirmations/:id/answer', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = answerSchema.parse(req.body);

    const result = await answerConfirmation(id, body.answer);
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    return next(err);
  }
});

confirmationsRouter.get('/confirmations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const conf = await prisma.confirmation.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!conf) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Confirmation not found' } });
    }

    return res.status(200).json({ ok: true, data: conf });
  } catch (err) {
    return next(err);
  }
});
