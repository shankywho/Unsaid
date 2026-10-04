import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

/** Every error leaves the API as `{ error: { code, message, requestId, details? } }`. */
export interface ErrorEnvelope {
  error: { code: string; message: string; requestId?: string; details?: unknown };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorEnvelope = {
    error: { code: 'not_found', message: 'route not found', requestId: req.requestId },
  };
  res.status(404).json(body);
};

interface HttpishError {
  status?: number;
  statusCode?: number;
  type?: string;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId;
  const send = (status: number, code: string, message: string, details?: unknown) => {
    const body: ErrorEnvelope = { error: { code, message, requestId, ...(details ? { details } : {}) } };
    res.status(status).json(body);
  };

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    return send(
      400,
      'validation_error',
      err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  // body-parser / http-errors
  const h = err as HttpishError;
  if (h?.type === 'entity.too.large') return send(413, 'payload_too_large', 'request body too large');
  if (h?.type === 'entity.parse.failed') return send(400, 'invalid_json', 'request body is not valid JSON');
  if (h?.type === 'encoding.unsupported' || h?.type === 'charset.unsupported') {
    return send(415, 'unsupported_media_type', 'unsupported content encoding');
  }

  // Prisma "record not found" (update/delete of a missing row) -> 404 instead of 500
  if ((err as { code?: string })?.code === 'P2025') return send(404, 'not_found', 'resource not found');

  logger.error({ err, requestId }, 'unhandled error');
  return send(500, 'internal', 'internal error');
};
