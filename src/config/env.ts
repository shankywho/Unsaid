import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8080'),
  API_KEY: z.string().default('dev-key'),
  MOCK_EXTERNALS: bool,
  /** Dev/demo only: artificial delay per mocked agent call, so the live trace can be watched. */
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).max(5000).default(0),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().default(''),
  QDRANT_COLLECTION_PREFIX: z.string().default(''),
  QDRANT_ALLOW_RESET: bool,

  LYZR_API_KEY: z.string().default(''),
  LYZR_INFERENCE_URL: z.string().default('https://agent-prod.studio.lyzr.ai/v3/inference/chat/'),
  LYZR_AGENT_FRAGMENT_ID: z.string().default(''),
  LYZR_AGENT_CONTEXT_EXTRACTOR_ID: z.string().default(''),
  LYZR_AGENT_HYPOTHESIS_ID: z.string().default(''),
  LYZR_AGENT_CONFIRM_ID: z.string().default(''),
  LYZR_AGENT_LEARNER_ID: z.string().default(''),
  LYZR_AGENT_UTTERANCE_CLASSIFIER_ID: z.string().default(''),
  LYZR_AGENT_EVAL_JUDGE_ID: z.string().default(''),

  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
  LLM_PROVIDER: z.enum(['lyzr', 'groq', 'mock']).default('groq'),

  OPENAI_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),
  TTS_MODEL: z.string().default('tts-1'),
  TTS_VOICE: z.string().default('alloy'),

  OMI_APP_ID: z.string().default(''),
  OMI_APP_SECRET: z.string().default(''),
  OMI_WEBHOOK_SECRET: z.string().default(''),

  CONFIRMATION_TIMEOUT_SEC: z.coerce.number().int().positive().default(45),
  RAW_TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  INGEST_WINDOW_SIZE: z.coerce.number().int().positive().default(6),
  INGEST_IDLE_SEC: z.coerce.number().int().positive().default(30),
  AUDIO_DIR: z.string().default('./storage/audio'),

  // --- HTTP hardening / auth ---
  CORS_ORIGINS: z.string().default(''), // comma-separated allowlist, e.g. https://app.example.com
  TRUST_PROXY: z.coerce.number().int().min(0).default(0), // number of reverse-proxy hops
  BODY_LIMIT_KB: z.coerce.number().int().positive().default(256),
  RATE_LIMIT_ENABLED: bool.default(true),
  RATE_LIMIT_V1_PER_MIN: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WEBHOOK_PER_MIN: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_PER_15MIN: z.coerce.number().int().positive().default(10),
  DEMO_EMAIL: z.string().default(''),
  DEMO_PASSWORD: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  WEB_DIST: z.string().default(''), // built frontend (web/dist) to serve; auto-detected when empty
  ENABLE_DOCS: bool, // force /docs on in production
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (e.API_KEY === 'dev-key' || e.API_KEY.length < 16)
      problems.push('API_KEY must be set to a strong value (>=16 chars)');
    if (e.OMI_WEBHOOK_SECRET.length < 16) problems.push('OMI_WEBHOOK_SECRET must be set (>=16 chars)');
    if (e.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be >=32 chars');
    if (problems.length) throw new Error(`Invalid production environment: ${problems.join('; ')}`);
  }
  return e;
}

export const env: Env = loadEnv();
