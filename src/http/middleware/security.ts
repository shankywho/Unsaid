import type { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { allowedOrigins } from '../auth/session';

/** Strict CSP for the JSON API; the dev console and API docs need inline script/style (and a CDN for docs). */
const apiHelmet = helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } });
const pageHelmet = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
});

export const securityHeaders: RequestHandler = (req, res, next) =>
  (req.path === '/debug' || req.path.startsWith('/docs') ? pageHelmet : apiHelmet)(req, res, next);

/** CORS allowlist from CORS_ORIGINS. Empty list = no cross-origin access (same-origin / scripts only). */
export const corsAllowlist: RequestHandler = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl, server-to-server, same-origin
    cb(null, allowedOrigins().includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 600,
});

const noop: RequestHandler = (_req, _res, next) => next();

function limiter(windowMs: number, limit: number, code: string): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) return noop;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res
        .status(429)
        .json({ error: { code, message: 'too many requests, slow down', requestId: req.requestId } });
    },
  });
}

export const v1RateLimit = limiter(60_000, env.RATE_LIMIT_V1_PER_MIN, 'rate_limited');
export const webhookRateLimit = limiter(60_000, env.RATE_LIMIT_WEBHOOK_PER_MIN, 'rate_limited');
export const loginRateLimit = limiter(15 * 60_000, env.RATE_LIMIT_LOGIN_PER_15MIN, 'login_rate_limited');
