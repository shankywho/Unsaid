import express from 'express';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { requestId } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requireAuth } from './middleware/auth';
import { corsAllowlist, securityHeaders, v1RateLimit, webhookRateLimit } from './middleware/security';
import { healthRouter } from './routes/health';
import { streamRouter } from './routes/stream';
import { webhooksRouter } from './routes/webhooks';
import { audioRouter } from './routes/audio';
import { confirmationsRouter } from './routes/confirmations';
import { simulateRouter } from './routes/simulate';
import { usersRouter } from './routes/users';
import { runsRouter } from './routes/runs';
import { memoryRouter } from './routes/memory';
import { authRouter } from './routes/auth';
import { omiRouter } from './routes/omi';
import { docsRouter } from './routes/docs';

export const docsEnabled = (): boolean => env.NODE_ENV !== 'production' || env.ENABLE_DOCS;

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(securityHeaders);
  app.use(corsAllowlist);

  // Structured access log: never the query string (may carry api_key/secret) and never the body.
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/healthz' || req.path === '/readyz') return;
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - t0) / 1_000_000n),
        },
        'http',
      );
    });
    next();
  });

  app.use(express.json({ limit: `${env.BODY_LIMIT_KB}kb` }));

  // Dev tooling only: the debug console and API docs are not served in production (docs can be forced on).
  if (env.NODE_ENV !== 'production') {
    app.use(express.static(path.resolve(__dirname, '../../public')));
    app.get('/debug', (_req, res) => res.sendFile(path.resolve(__dirname, '../../public/debug.html')));
  }
  if (docsEnabled()) app.use(docsRouter);

  app.use(healthRouter);
  app.use('/webhooks', webhookRateLimit, webhooksRouter);
  app.use('/v1', v1RateLimit);
  app.use(audioRouter); // /v1/audio/:id public
  app.use(authRouter); // /auth/login, /auth/logout, /v1/me
  app.use(
    '/v1',
    requireAuth,
    streamRouter,
    confirmationsRouter,
    simulateRouter,
    usersRouter,
    runsRouter,
    memoryRouter,
    omiRouter,
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
