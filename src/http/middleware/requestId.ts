import type { RequestHandler } from 'express';
import { newId } from '../../lib/ids';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = (req.header('x-request-id') as string | undefined) ?? newId();
  res.setHeader('x-request-id', req.requestId);
  next();
};
