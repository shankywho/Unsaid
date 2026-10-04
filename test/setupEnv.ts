import 'dotenv/config';

// Isolate tests from dev data: separate DB, Redis db 1, prefixed Qdrant collections, mocked externals.
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://unsaid:unsaid@localhost:5432/unsaid');
base.pathname = '/unsaid_test';
process.env.DATABASE_URL = base.toString();
process.env.REDIS_URL = `${(process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '')}/1`;
process.env.QDRANT_COLLECTION_PREFIX = 'test_';
process.env.MOCK_EXTERNALS = 'true';
process.env.AUTH_DISABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.AUDIO_DIR = './storage/test-audio';
process.env.API_KEY = 'test-key';
process.env.OMI_WEBHOOK_SECRET = '';
process.env.EMBEDDING_DIM = '256';
process.env.INGEST_IDLE_SEC = '1';
process.env.EVAL_ALLOW_MOCK = 'true';
process.env.EVAL_RESULTS_DIR = './storage/test-eval-results';
process.env.DEMO_EMAIL = 'demo@unsaid.test';
process.env.DEMO_PASSWORD = 'demo-password-for-tests';
process.env.SESSION_SECRET = 'test-session-secret-test-session-secret';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.WEB_DIST = 'off';
