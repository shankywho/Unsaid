import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

export const SESSION_COOKIE = 'unsaid_session';

// Production boot fails without a real SESSION_SECRET (see loadEnv); the fallback only exists for local dev/tests.
const secret = (): string => env.SESSION_SECRET || 'dev-only-session-secret-not-for-production';

export interface SessionPayload {
  sub: string; // account email
  exp: number; // epoch seconds
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const mac = (data: string): string => createHmac('sha256', secret()).update(data).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare fixed-length digests so neither content nor length leaks through timing.
  const ah = createHmac('sha256', 'cmp').update(ab).digest();
  const bh = createHmac('sha256', 'cmp').update(bb).digest();
  return timingSafeEqual(ah, bh) && ab.length === bb.length;
}

export function signSession(sub: string, ttlHours = env.SESSION_TTL_HOURS, nowMs = Date.now()): string {
  const payload: SessionPayload = { sub, exp: Math.floor(nowMs / 1000) + ttlHours * 3600 };
  const body = b64(JSON.stringify(payload));
  return `${body}.${mac(body)}`;
}

export function verifySession(token: string | undefined, nowMs = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, mac(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number') return null;
    return p.exp > Math.floor(nowMs / 1000) ? p : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export const allowedOrigins = (): string[] =>
  env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
