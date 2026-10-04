import { z } from 'zod';
import * as S from './schemas';

type Json = Record<string, unknown>;
type Auth = 'public' | 'auth' | 'webhook';

interface RouteDoc {
  method: 'get' | 'post' | 'patch' | 'delete';
  /** OpenAPI path template, e.g. /v1/users/{id} */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  auth: Auth;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** status -> schema (omitted schema = empty body) */
  responses: Record<number, { description: string; schema?: z.ZodType; contentType?: string }>;
}

const ok = S.okData;
const errs = (...codes: number[]): RouteDoc['responses'] =>
  Object.fromEntries(
    codes.map((c) => [c, { description: ERROR_TEXT[c] ?? 'Error', schema: S.ErrorEnvelopeSchema }]),
  );
const ERROR_TEXT: Record<number, string> = {
  400: 'Validation error',
  401: 'Missing or invalid credentials',
  403: 'Forbidden (origin not allowed)',
  404: 'Not found',
  413: 'Payload too large',
  429: 'Rate limited',
  503: 'Service unavailable / not configured',
};

export const ROUTES: RouteDoc[] = [
  // ---- health ----
  {
    method: 'get',
    path: '/healthz',
    tag: 'Health',
    summary: 'Liveness probe',
    description: 'Process is up. Never touches dependencies.',
    auth: 'public',
    responses: { 200: { description: 'Alive', schema: S.HealthSchema } },
  },
  {
    method: 'get',
    path: '/readyz',
    tag: 'Health',
    summary: 'Readiness probe',
    description: 'Checks Postgres, Redis, Qdrant reachability and Lyzr configuration. 503 when degraded.',
    auth: 'public',
    responses: {
      200: { description: 'Ready', schema: S.ReadinessSchema },
      503: { description: 'Degraded', schema: S.ReadinessSchema },
    },
  },
  // ---- auth ----
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Log in with the demo account',
    description:
      'Sets an httpOnly `unsaid_session` cookie. Send later requests with `credentials: "include"`. Rate limited per IP.',
    auth: 'public',
    body: S.LoginBody,
    responses: {
      200: {
        description: 'Session started',
        schema: ok(z.object({ email: z.string(), expiresAt: z.iso.datetime() })),
      },
      ...errs(400, 401, 429, 503),
    },
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Auth',
    summary: 'Clear the session cookie',
    auth: 'public',
    responses: { 200: { description: 'Logged out', schema: z.object({ ok: z.literal(true) }) } },
  },
  {
    method: 'get',
    path: '/v1/me',
    tag: 'Auth',
    summary: 'Current principal and the patients it can see',
    auth: 'auth',
    responses: { 200: { description: 'Principal', schema: ok(S.MeSchema) }, ...errs(401, 429) },
  },
  // ---- users ----
  {
    method: 'post',
    path: '/v1/users',
    tag: 'Users',
    summary: 'Create a patient profile',
    auth: 'auth',
    body: S.CreateUserBody,
    responses: { 201: { description: 'Created', schema: ok(S.UserSchema) }, ...errs(400, 401, 429) },
  },
  {
    method: 'get',
    path: '/v1/users/{id}',
    tag: 'Users',
    summary: 'Get a patient with activity counts',
    auth: 'auth',
    params: S.IdParams,
    responses: { 200: { description: 'User', schema: ok(S.UserDetailSchema) }, ...errs(401, 404, 429) },
  },
  {
    method: 'patch',
    path: '/v1/users/{id}',
    tag: 'Users',
    summary: 'Update patient settings (context ON/OFF ablation toggle, assist mode)',
    auth: 'auth',
    params: S.IdParams,
    body: S.UpdateUserBody,
    responses: { 200: { description: 'Updated', schema: ok(S.UserSchema) }, ...errs(400, 401, 404, 429) },
  },
  {
    method: 'get',
    path: '/v1/users/{id}/wordmap',
    tag: 'Users',
    summary: 'Learned word map: substitutions and resolved utterances',
    auth: 'auth',
    params: S.IdParams,
    responses: { 200: { description: 'Word map', schema: ok(S.WordMapSchema) }, ...errs(401, 429) },
  },
  {
    method: 'get',
    path: '/v1/users/{id}/insights',
    tag: 'Users',
    summary: 'Caregiver insights: resolution rates and top substitutions',
    auth: 'auth',
    params: S.IdParams,
    responses: { 200: { description: 'Insights', schema: ok(S.InsightsSchema) }, ...errs(401, 404, 429) },
  },
  // ---- assist ----
  {
    method: 'post',
    path: '/v1/simulate/fragment',
    tag: 'Assist',
    summary: 'Run the ASSIST pipeline on a fragment',
    description:
      'Equivalent to a patient fragment arriving from Omi. Returns once the first confirmation question has been created; follow progress on `/v1/stream`. A bare "yes"/"no" while a confirmation is pending answers it locally.',
    auth: 'auth',
    body: S.SimulateFragmentBody,
    responses: {
      200: { description: 'Pipeline result', schema: ok(S.SimulateFragmentResultSchema) },
      ...errs(400, 401, 404, 429),
    },
  },
  {
    method: 'post',
    path: '/v1/simulate/segments',
    tag: 'Assist',
    summary: 'Inject transcript segments (ambient or patient) as if they came from Omi',
    description: 'Idempotent: re-sending a segment is counted in `duplicates` and does no further work.',
    auth: 'auth',
    body: S.SimulateSegmentsBody,
    responses: {
      200: {
        description: 'Processed',
        schema: z.object({ ok: z.literal(true), processed: z.number().int(), duplicates: z.number().int() }),
      },
      ...errs(400, 401, 404, 429),
    },
  },
  {
    method: 'get',
    path: '/v1/confirmations/{id}',
    tag: 'Assist',
    summary: 'Get a confirmation (state machine snapshot)',
    auth: 'auth',
    params: S.IdParams,
    responses: {
      200: { description: 'Confirmation', schema: ok(S.ConfirmationSchema) },
      ...errs(401, 404, 429),
    },
  },
  {
    method: 'post',
    path: '/v1/confirmations/{id}/answer',
    tag: 'Assist',
    summary: 'Answer yes/no to the current confirmation question',
    description:
      '`yes` resolves with the current hypothesis; `no` advances to the next hypothesis, or ends with `assist.unresolved` after the last. Answering a non-PENDING confirmation is a no-op that returns its final state.',
    auth: 'auth',
    params: S.IdParams,
    body: S.AnswerBody,
    responses: {
      200: { description: 'Result', schema: ok(S.AnswerResultSchema) },
      ...errs(400, 401, 404, 429),
    },
  },
  {
    method: 'get',
    path: '/v1/audio/{id}',
    tag: 'Assist',
    summary: 'Stream a synthesized question/sentence (MP3)',
    description: 'Public: browser `<audio>` cannot send headers. Ids are unguessable UUIDs.',
    auth: 'public',
    params: z.object({ id: z.uuid() }),
    responses: {
      200: { description: 'audio/mpeg', contentType: 'audio/mpeg' },
      ...errs(404, 429),
    },
  },
  // ---- observability ----
  {
    method: 'get',
    path: '/v1/stream',
    tag: 'Events',
    summary: 'Server-Sent Events feed for one patient',
    description:
      'Each frame is `event: <type>` + `data: <EventEnvelope JSON>`. See docs/FRONTEND_CONTRACT.md for every event type and the ASSIST trace lifecycle. Browsers: `new EventSource(url, { withCredentials: true })` with the session cookie, or `?api_key=` for scripts.',
    auth: 'auth',
    query: S.StreamQuery,
    responses: {
      200: {
        description: 'text/event-stream of EventEnvelope',
        schema: S.EventEnvelopeSchema,
        contentType: 'text/event-stream',
      },
      ...errs(400, 401, 429),
    },
  },
  {
    method: 'get',
    path: '/v1/runs',
    tag: 'Runs',
    summary: 'List pipeline runs',
    auth: 'auth',
    query: S.RunsQuery,
    responses: {
      200: { description: 'Runs', schema: ok(z.array(S.RunWithCountSchema)) },
      ...errs(400, 401, 429),
    },
  },
  {
    method: 'get',
    path: '/v1/runs/{id}',
    tag: 'Runs',
    summary: 'Full trace of a run: steps, latencies, retrieval hits with scores',
    auth: 'auth',
    params: S.IdParams,
    responses: { 200: { description: 'Run trace', schema: ok(S.RunDetailSchema) }, ...errs(401, 404, 429) },
  },
  // ---- memory ----
  {
    method: 'get',
    path: '/v1/memory',
    tag: 'Memory',
    summary: "List or semantically search a patient's memory facts",
    auth: 'auth',
    query: S.MemoryListQuery,
    responses: {
      200: { description: 'Facts', schema: ok(z.array(S.MemoryFactSchema)) },
      ...errs(400, 401, 429),
    },
  },
  {
    method: 'delete',
    path: '/v1/memory/{pointId}',
    tag: 'Memory',
    summary: 'Delete one memory fact (privacy control)',
    auth: 'auth',
    params: S.PointIdParams,
    query: S.MemoryDeleteQuery,
    responses: {
      200: { description: 'Deleted', schema: z.object({ ok: z.literal(true), deleted: z.string() }) },
      ...errs(400, 401, 429),
    },
  },
  {
    method: 'post',
    path: '/v1/memory/purge',
    tag: 'Memory',
    summary: 'Erase all memory and word-map vectors for a patient',
    auth: 'auth',
    body: S.PurgeBody,
    responses: {
      200: {
        description: 'Purged',
        schema: z.object({ ok: z.literal(true), purged: z.literal(true), userId: z.string() }),
      },
      ...errs(400, 401, 429),
    },
  },
  // ---- omi ----
  {
    method: 'get',
    path: '/v1/omi/status',
    tag: 'Omi',
    summary: 'Is the Omi live path delivering?',
    description: 'Last segment time, source (OMI_REALTIME vs SIMULATED) and 5-minute counts.',
    auth: 'auth',
    query: S.OmiStatusQuery,
    responses: { 200: { description: 'Status', schema: ok(S.OmiStatusSchema) }, ...errs(400, 401, 429) },
  },
  {
    method: 'post',
    path: '/webhooks/omi/transcript',
    tag: 'Webhooks',
    summary: 'Omi real-time transcript webhook',
    description:
      'Body: `{ session_id, segments: [...] }` (a bare array is also accepted). Query: `uid`, optional `session_id`. Authenticated by the webhook secret (`?secret=`, `x-omi-secret` header, or `/webhooks/omi/transcript/{secret}`), not by the API key. Always 200 for unparseable payloads (raw body is stored). Duplicate segments are reported in `duplicates` and do no extra work.',
    auth: 'webhook',
    query: S.WebhookQuery,
    body: z.union([
      z.array(z.record(z.string(), z.unknown())),
      z.object({ segments: z.array(z.record(z.string(), z.unknown())) }).loose(),
    ]),
    responses: { 200: { description: 'Accepted', schema: S.WebhookAckSchema }, ...errs(401, 413, 429) },
  },
  {
    method: 'post',
    path: '/webhooks/omi/memory',
    tag: 'Webhooks',
    summary: 'Omi conversation-created (memory) webhook',
    description: 'Body is a finished conversation with `transcript_segments`. Runs the INGEST pipeline.',
    auth: 'webhook',
    query: S.WebhookQuery,
    body: z.object({ transcript_segments: z.array(z.record(z.string(), z.unknown())).optional() }).loose(),
    responses: { 200: { description: 'Accepted', schema: S.WebhookAckSchema }, ...errs(401, 413, 429) },
  },
];

// ---------- builder ----------

const REF_PREFIX = '#/components/schemas/';

/** Make zod's JSON Schema output spec-clean and point refs at components. */
function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (node && typeof node === 'object') {
    const o = node as Json;
    const out: Json = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === '$schema' || k === '$defs' || k === 'id') continue;
      if (k === 'pattern' && o.format === 'date-time') continue;
      if (
        (k === 'minimum' || k === 'maximum') &&
        typeof v === 'number' &&
        Math.abs(v) >= Number.MAX_SAFE_INTEGER
      ) {
        continue;
      }
      if (k === '$ref' && typeof v === 'string') {
        out[k] = v.replace('#/$defs/', REF_PREFIX);
        continue;
      }
      out[k] = clean(v);
    }
    return out;
  }
  return node;
}

const toSchema = (schema: z.ZodType, io: 'input' | 'output'): Json =>
  clean(z.toJSONSchema(schema, { unrepresentable: 'any', io })) as Json;

function parametersOf(schema: z.ZodObject, where: 'path' | 'query'): Json[] {
  const js = toSchema(schema, 'input') as { properties?: Record<string, Json>; required?: string[] };
  return Object.entries(js.properties ?? {}).map(([name, s]) => ({
    name,
    in: where,
    required: where === 'path' ? true : (js.required ?? []).includes(name),
    schema: s,
  }));
}

export function buildOpenApi(): Json {
  const registry = z.toJSONSchema(z.globalRegistry, {
    uri: (id: string) => `${REF_PREFIX}${id}`,
    unrepresentable: 'any',
    io: 'output',
  }) as unknown as { schemas: Record<string, unknown> };

  const components: Json = {};
  for (const [name, s] of Object.entries(registry.schemas)) components[name] = clean(s);

  const paths: Record<string, Json> = {};
  for (const r of ROUTES) {
    const params = [
      ...(r.params ? parametersOf(r.params, 'path') : []),
      ...(r.query ? parametersOf(r.query, 'query') : []),
    ];
    const responses: Json = {};
    for (const [status, resp] of Object.entries(r.responses)) {
      const ct = resp.contentType ?? 'application/json';
      responses[status] = resp.schema
        ? { description: resp.description, content: { [ct]: { schema: toSchema(resp.schema, 'output') } } }
        : {
            description: resp.description,
            content: { [ct]: { schema: { type: 'string', format: 'binary' } } },
          };
    }
    const op: Json = {
      tags: [r.tag],
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      operationId: `${r.method}_${r.path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      ...(params.length ? { parameters: params } : {}),
      ...(r.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: toSchema(r.body, 'input') } },
            },
          }
        : {}),
      security:
        r.auth === 'public'
          ? []
          : r.auth === 'webhook'
            ? [{ webhookSecret: [] }, { webhookSecretHeader: [] }]
            : [{ sessionCookie: [] }, { bearerAuth: [] }],
      responses,
    };
    (paths[r.path] ??= {})[r.method] = op;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Unsaid API',
      version: '0.1.0',
      description:
        'Backend for Unsaid, a communication aid for people with non-fluent aphasia. Not a medical device; makes no diagnostic or therapeutic claims. Generated from zod schemas (src/http/schemas.ts) by `pnpm openapi`.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: 'http://localhost:8080', description: 'Local' }],
    tags: [...new Set(ROUTES.map((r) => r.tag))].map((name) => ({ name })),
    paths,
    components: {
      schemas: components,
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'unsaid_session',
          description: 'From POST /auth/login',
        },
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'API_KEY, for scripts' },
        webhookSecret: { type: 'apiKey', in: 'query', name: 'secret' },
        webhookSecretHeader: { type: 'apiKey', in: 'header', name: 'x-omi-secret' },
      },
    },
  };
}

/** `/v1/users/{id}` -> `/v1/users/:id` for comparing with Express routes. */
export const toExpressPath = (p: string): string => p.replace(/\{(\w+)\}/g, ':$1');
