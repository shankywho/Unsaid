import express from 'express';
import path from 'node:path';
import { requestId } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/error';
import { healthRouter } from './routes/health';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.resolve(__dirname, '../../public')));
  app.use(healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
