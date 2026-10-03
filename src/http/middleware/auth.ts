import type { RequestHandler } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

export const requireApiKey: RequestHandler = (req, _res, next) => {
  const h = req.header('authorization') ?? '';
  if (h === `Bearer ${env.API_KEY}`) return next();
  next(new AppError(401, 'unauthorized', 'missing or invalid bearer token'));
};
