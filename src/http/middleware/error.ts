import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ error: { code: 'not_found', message: 'route not found', requestId: req.requestId } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId;
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        requestId,
      },
    });
    return;
  }
  logger.error({ err, requestId }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'internal error', requestId } });
};
