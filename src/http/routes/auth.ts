import { Router } from 'express';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../db';
import { AppError, unauthorized } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { SESSION_COOKIE, safeEqual, signSession } from '../auth/session';
import { requireAuth } from '../middleware/auth';
import { loginRateLimit } from '../middleware/security';
import { LoginBody } from '../schemas';

export const authRouter = Router();

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/',
});

function clearCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** One demo account from env (DEMO_EMAIL / DEMO_PASSWORD). Issues an httpOnly session cookie. */
authRouter.post('/auth/login', loginRateLimit, (req, res, next) => {
  try {
    if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) {
      throw new AppError(503, 'auth_not_configured', 'DEMO_EMAIL / DEMO_PASSWORD are not configured');
    }
    const { email, password } = LoginBody.parse(req.body);
    // Evaluate both so timing does not reveal which field was wrong.
    const emailOk = safeEqual(email.trim().toLowerCase(), env.DEMO_EMAIL.trim().toLowerCase());
    const passOk = safeEqual(password, env.DEMO_PASSWORD);
    if (!emailOk || !passOk) {
      logger.warn({ requestId: req.requestId }, 'login failed');
      throw unauthorized('invalid email or password');
    }
    const token = signSession(env.DEMO_EMAIL.trim().toLowerCase());
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: env.SESSION_TTL_HOURS * 3_600_000 });
    return res.status(200).json({
      ok: true,
      data: {
        email: env.DEMO_EMAIL.trim().toLowerCase(),
        expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000).toISOString(),
      },
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post('/auth/logout', (_req, res) => {
  clearCookie(res);
  res.status(200).json({ ok: true });
});

/** Who am I + which patients can I see. Works with a session cookie or the bearer API key. */
authRouter.get('/v1/me', requireAuth, async (req, res, next) => {
  try {
    const patients = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true, contextEnabled: true, assistMode: true },
      take: 100,
    });
    const p = req.principal!;
    return res.status(200).json({
      ok: true,
      data: {
        principal:
          p.type === 'session'
            ? { type: 'session', email: p.email, expiresAt: new Date(p.expiresAt * 1000).toISOString() }
            : { type: 'api_key' },
        patients,
      },
    });
  } catch (err) {
    return next(err);
  }
});
