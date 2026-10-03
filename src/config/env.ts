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
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
