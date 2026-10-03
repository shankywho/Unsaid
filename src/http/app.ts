import express from 'express';
import path from 'node:path';
import { requestId } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/error';
import { healthRouter } from './routes/health';
import { requireApiKey } from './middleware/auth';
import { streamRouter } from './routes/stream';
import { webhooksRouter } from './routes/webhooks';
import { audioRouter } from './routes/audio';
import { confirmationsRouter } from './routes/confirmations';
import { simulateRouter } from './routes/simulate';
import { usersRouter } from './routes/users';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.resolve(__dirname, '../../public')));
  app.use(healthRouter);
  app.use(webhooksRouter);
  app.use(audioRouter); // /v1/audio/:id public
  app.use('/v1', requireApiKey, streamRouter, confirmationsRouter, simulateRouter, usersRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}


