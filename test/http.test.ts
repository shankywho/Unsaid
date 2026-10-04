import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createApp } from '../src/http/app';
import { env } from '../src/config/env';
import { loadEnv } from '../src/config/env';
import { prisma } from '../src/db';
import { resetAll, makeUser } from './helpers';
import { signSession, verifySession } from '../src/http/auth/session';
import { ROUTES, toExpressPath } from '../src/http/openapi';

const bearer = { Authorization: `Bearer ${env.API_KEY}` };

describe('Phase B — auth', () => {
  const app = createApp();
  beforeEach(async () => {
    await resetAll();
  });

  it('rejects unauthenticated /v1 requests with the error envelope', async () => {
    const res = await request(app).get('/v1/runs');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('keeps bearer API_KEY working for scripts', async () => {
    const res = await request(app).get('/v1/runs').set(bearer);
    expect(res.status).toBe(200);
  });

  it('login sets an httpOnly cookie that authenticates /v1/me; logout clears it', async () => {
    const bad = await request(app).post('/auth/login').send({ email: env.DEMO_EMAIL, password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.headers['set-cookie']).toBeUndefined();

    const login = await request(app)
      .post('/auth/login')
      .send({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/unsaid_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    await makeUser({ displayName: 'Mohan' });
    const me = await request(app).get('/v1/me').set('Cookie', cookie.split(';')[0]);
    expect(me.status).toBe(200);
    expect(me.body.data.principal).toMatchObject({ type: 'session', email: env.DEMO_EMAIL });
    expect(me.body.data.patients).toHaveLength(1);

    const out = await request(app).post('/auth/logout');
    expect(out.status).toBe(200);
    expect(String(out.headers['set-cookie'])).toMatch(/unsaid_session=;/);
  });

  it('rejects tampered or expired session tokens', () => {
    const good = signSession('a@b.c');
    expect(verifySession(good)?.sub).toBe('a@b.c');
    expect(verifySession(`${good}x`)).toBeNull();
    expect(verifySession(good, Date.now() + 48 * 3_600_000)).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });

  it('applies a CSRF origin check to cookie-authenticated writes only', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const res = await request(app)
      .post('/v1/users')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ displayName: 'x' });
    expect(res.status).toBe(403);
    // same call with the API key is not subject to the cookie CSRF rule
    const ok = await request(app)
      .post('/v1/users')
      .set(bearer)
      .set('Origin', 'https://evil.example')
      .send({ displayName: 'x' });
    expect(ok.status).toBe(201);
  });

  it('refuses production boot with weak secrets', () => {
    expect(() =>
      loadEnv({
        ...process.env,
        NODE_ENV: 'production',
        API_KEY: 'dev-key',
        SESSION_SECRET: 'short',
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid production environment/);
  });
});

describe('Phase B — security middleware & error envelope', () => {
  const app = createApp();

  it('sends helmet headers and hides x-powered-by', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  describe('CORS allowlist', () => {
    const saved = env.CORS_ORIGINS;
    afterEach(() => {
      env.CORS_ORIGINS = saved;
    });
    it('allows listed origins and not others', async () => {
      env.CORS_ORIGINS = 'https://app.example.com, http://localhost:3000';
      const yes = await request(app).get('/healthz').set('Origin', 'http://localhost:3000');
      expect(yes.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(yes.headers['access-control-allow-credentials']).toBe('true');
      const no = await request(app).get('/healthz').set('Origin', 'https://evil.example');
      expect(no.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  it('enforces the body size limit with the envelope', async () => {
    const big = 'x'.repeat((env.BODY_LIMIT_KB + 10) * 1024);
    const res = await request(app).post('/v1/users').set(bearer).send({ displayName: big });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('maps malformed JSON, validation errors, unknown routes and missing rows to the envelope', async () => {
    const bad = await request(app)
      .post('/v1/users')
      .set(bearer)
      .set('Content-Type', 'application/json')
      .send('{nope');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_json');

    const val = await request(app).post('/v1/simulate/fragment').set(bearer).send({ userId: '', text: 5 });
    expect(val.status).toBe(400);
    expect(val.body.error.code).toBe('validation_error');
    expect(Array.isArray(val.body.error.details)).toBe(true);

    const q = await request(app).get('/v1/runs?limit=abc').set(bearer);
    expect(q.status).toBe(400);

    const nf = await request(app).get('/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not_found');

    const missing = await request(app).get('/v1/users/does-not-exist').set(bearer);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');

    const patch = await request(app).patch('/v1/users/does-not-exist').set(bearer).send({ displayName: 'x' });
    expect(patch.status).toBe(404);

    const strict = await request(app).patch('/v1/users/anything').set(bearer).send({ role: 'ADMIN' });
    expect(strict.status).toBe(400);
  });

  it('rejects path traversal on the audio route', async () => {
    const res = await request(app).get('/v1/audio/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(404);
  });

  it('rate limiter returns the envelope with 429 (limiter config as used by the app)', async () => {
    const mini = express();
    mini.use(
      rateLimit({
        windowMs: 60_000,
        limit: 2,
        standardHeaders: 'draft-7',
        handler: (_req, res) => {
          res.status(429).json({ error: { code: 'rate_limited', message: 'too many requests, slow down' } });
        },
      }),
    );
    mini.get('/x', (_req, res) => {
      res.json({ ok: true });
    });
    await request(mini).get('/x');
    await request(mini).get('/x');
    const third = await request(mini).get('/x');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('rate_limited');
    expect(third.headers['ratelimit']).toBeDefined();
  });
});

describe('Phase B — health & readiness', () => {
  const app = createApp();
  it('/healthz is a cheap liveness probe', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
  it('/readyz checks db, redis, qdrant and lyzr config', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok', qdrant: 'ok', lyzr: 'mock' });
  });
});

describe('Phase B — Omi webhook: auth, idempotency, status', () => {
  const app = createApp();
  const saved = env.OMI_WEBHOOK_SECRET;
  beforeEach(async () => {
    await resetAll();
  });
  afterEach(() => {
    env.OMI_WEBHOOK_SECRET = saved;
  });

  const payload = (text: string) => ({
    session_id: 'sess-dup',
    segments: [{ id: 'a', text, is_user: true, speaker: 'SPEAKER_0', start: 1.5, end: 3 }],
  });

  it('processes a duplicate segment only once (sequential and concurrent resends)', async () => {
    const user = await makeUser({ omiUid: 'uid-dup' });
    const url = '/webhooks/omi/transcript?uid=uid-dup';

    const first = await request(app).post(url).send(payload('water… Ramesh… bill'));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ received: 1, duplicates: 0 });

    const second = await request(app).post(url).send(payload('water… Ramesh… bill'));
    expect(second.body).toMatchObject({ received: 1, duplicates: 1 });

    const [c, d] = await Promise.all([
      request(app).post(url).send(payload('water… Ramesh… bill')),
      request(app).post(url).send(payload('water… Ramesh… bill')),
    ]);
    expect(c.body.duplicates + d.body.duplicates).toBe(2);

    expect(await prisma.transcriptSegment.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.run.count({ where: { userId: user.id, pipeline: 'ASSIST' } })).toBe(1);
    expect(await prisma.confirmation.count({ where: { userId: user.id } })).toBe(1);
    // every raw payload is still stored for forensics
    expect(await prisma.rawWebhook.count()).toBe(4);
  });

  it('requires the webhook secret when configured (query, header or path) and never stores or logs it', async () => {
    env.OMI_WEBHOOK_SECRET = 's3cret-value';
    await makeUser({ omiUid: 'uid-sec' });
    const body = payload('hello there');

    expect((await request(app).post('/webhooks/omi/transcript?uid=uid-sec').send(body)).status).toBe(401);
    expect(
      (await request(app).post('/webhooks/omi/transcript?uid=uid-sec&secret=wrong').send(body)).status,
    ).toBe(401);
    expect(
      (await request(app).post('/webhooks/omi/transcript?uid=uid-sec&secret=s3cret-value').send(body)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/webhooks/omi/transcript?uid=uid-sec')
          .set('x-omi-secret', 's3cret-value')
          .send(body)
      ).status,
    ).toBe(200);
    expect(
      (await request(app).post('/webhooks/omi/transcript/s3cret-value?uid=uid-sec').send(body)).status,
    ).toBe(200);
    // API key is NOT a webhook credential
    expect(
      (await request(app).post('/webhooks/omi/transcript?uid=uid-sec').set(bearer).send(body)).status,
    ).toBe(401);

    const raws = await prisma.rawWebhook.findMany();
    expect(JSON.stringify(raws)).not.toContain('s3cret-value');
  });

  it('accepts the documented Omi shape: bare array, camelCase speakerId, session_id only in the query', async () => {
    const user = await makeUser({ omiUid: 'uid-arr' });
    const res = await request(app)
      .post('/webhooks/omi/transcript?uid=uid-arr&session_id=abc123')
      .send([
        {
          text: 'Priya is coming Sunday',
          speaker: 'SPEAKER_00',
          speakerId: 0,
          is_user: false,
          start: 10,
          end: 15,
        },
      ]);
    expect(res.body).toMatchObject({ ok: true, received: 1, duplicates: 0 });
    const seg = await prisma.transcriptSegment.findFirstOrThrow({ where: { userId: user.id } });
    expect(seg).toMatchObject({ sessionId: 'abc123', source: 'OMI_REALTIME', isUser: false, startSec: 10 });
  });

  it('never 500s on garbage payloads and stores the raw body', async () => {
    const res = await request(app).post('/webhooks/omi/transcript?uid=x').send({ segments: 'nope' });
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);
    expect((await prisma.rawWebhook.findFirst())?.parsedOk).toBe(false);
  });

  it('/v1/omi/status distinguishes OMI_REALTIME from SIMULATED', async () => {
    const user = await makeUser({ omiUid: 'uid-st' });
    const empty = await request(app).get('/v1/omi/status').set(bearer);
    expect(empty.body.data.lastSegmentAt).toBeNull();

    await request(app).post('/webhooks/omi/transcript?uid=uid-st').send(payload('hello from omi'));
    await request(app)
      .post('/v1/simulate/segments')
      .set(bearer)
      .send({ userId: user.id, segments: [{ text: 'simulated chatter', isUser: false }] });

    const res = await request(app).get(`/v1/omi/status?userId=${user.id}`).set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.data.segmentsLast5Min).toMatchObject({ OMI_REALTIME: 1, SIMULATED: 1, OMI_MEMORY: 0 });
    expect(res.body.data.lastSegmentSource).toBe('SIMULATED');
    expect(res.body.data.rawWebhooksLast5Min).toBe(1);
  });
});

describe('Phase C — OpenAPI contract', () => {
  const app = createApp();

  it('documents every route the app serves (and nothing that does not exist)', () => {
    type Layer = {
      route?: { path: string; methods: Record<string, boolean> };
      name: string;
      handle: { stack?: Layer[] };
      regexp: RegExp;
    };
    const found = new Set<string>();
    const walk = (stack: Layer[], prefix: string) => {
      for (const l of stack) {
        if (l.route) {
          const m = Object.keys(l.route.methods)[0].toUpperCase();
          const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
          for (const p of paths) found.add(`${m} ${prefix}${p}`.replace(/\/$/, ''));
        } else if (l.name === 'router' && l.handle.stack) {
          const src = l.regexp.source;
          const mount =
            src === '^\\/?(?=\\/|$)'
              ? ''
              : src.replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
          walk(l.handle.stack, prefix + mount);
        }
      }
    };
    walk((app as unknown as { _router: { stack: Layer[] } })._router.stack, '');

    const internalOnly = (k: string) =>
      /\/docs/.test(k) || /\/debug/.test(k) || /\/transcript\/:secret|\/memory\/:secret/.test(k);
    const served = [...found].filter((k) => !internalOnly(k));
    expect(served.length).toBeGreaterThanOrEqual(ROUTES.length);
    const documented = new Set(ROUTES.map((r) => `${r.method.toUpperCase()} ${toExpressPath(r.path)}`));

    expect(served.filter((k) => !documented.has(k))).toEqual([]);
    expect([...documented].filter((k) => !found.has(k))).toEqual([]);
  });

  it('serves a valid OpenAPI 3.1 document at /docs/openapi.json', async () => {
    const res = await request(app).get('/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths).length).toBe(new Set(ROUTES.map((r) => r.path)).size);
    expect(res.body.components.schemas.Confirmation).toBeDefined();
    // every $ref resolves
    const refs = [...JSON.stringify(res.body).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map(
      (m) => m[1],
    );
    for (const r of refs) expect(res.body.components.schemas[r]).toBeDefined();
  });
});
