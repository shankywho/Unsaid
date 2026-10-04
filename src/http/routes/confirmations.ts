import { Router } from 'express';
import { prisma } from '../../db';
import { answerConfirmation } from '../../confirmations/service';
import { notFound } from '../../lib/errors';
import { AnswerBody, IdParams } from '../schemas';

export const confirmationsRouter = Router();

confirmationsRouter.post('/confirmations/:id/answer', async (req, res, next) => {
  try {
    const { id } = IdParams.parse(req.params);
    const body = AnswerBody.parse(req.body);
    const result = await answerConfirmation(id, body.answer);
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    return next(err);
  }
});

confirmationsRouter.get('/confirmations/:id', async (req, res, next) => {
  try {
    const { id } = IdParams.parse(req.params);
    const conf = await prisma.confirmation.findUnique({ where: { id } });
    if (!conf) throw notFound('Confirmation');
    return res.status(200).json({ ok: true, data: conf });
  } catch (err) {
    return next(err);
  }
});
