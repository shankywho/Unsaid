import type { RequestHandler } from 'express';
import { env } from '../../config/env';
import { forbidden, unauthorized } from '../../lib/errors';
import { SESSION_COOKIE, allowedOrigins, readCookie, safeEqual, verifySession } from '../auth/session';

export type Principal = { type: 'api_key' } | { type: 'session'; email: string; expiresAt: number };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Accepts, in order: `Authorization: Bearer <API_KEY>` (scripts), `?api_key=` (EventSource/<audio>
 * cannot set headers; used by /debug), or the httpOnly session cookie issued by POST /auth/login.
 * Cookie-authenticated state-changing requests must carry an allowlisted `Origin` (CSRF defence).
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const h = req.header('authorization') ?? '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7) : '';
  const queryKey = typeof req.query.api_key === 'string' ? req.query.api_key : '';
  if ((bearer && safeEqual(bearer, env.API_KEY)) || (queryKey && safeEqual(queryKey, env.API_KEY))) {
    req.principal = { type: 'api_key' };
    return next();
  }

  const session = verifySession(readCookie(req.header('cookie'), SESSION_COOKIE));
  if (session) {
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.header('origin');
      if (origin && !allowedOrigins().includes(origin)) return next(forbidden('origin not allowed'));
    }
    req.principal = { type: 'session', email: session.sub, expiresAt: session.exp };
    return next();
  }
  return next(unauthorized('missing or invalid credentials'));
};
