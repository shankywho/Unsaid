import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dot: Record<string, string> = {};
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) dot[m[1]] = m[2].replace(/\s+#.*$/, '').trim();
  }
} catch {
  /* CI provides env directly */
}
const pick = (k: string, d: string) => process.env[k] ?? dot[k] ?? d;

const PORT = 8099;
const dbBase = new URL(pick('DATABASE_URL', 'postgresql://unsaid:unsaid@localhost:5432/unsaid'));
dbBase.pathname = '/unsaid_e2e';
export const E2E = {
  port: PORT,
  baseURL: `http://127.0.0.1:${PORT}`,
  apiKey: 'e2e-api-key-0123456789',
  email: 'demo@unsaid.test',
  password: 'e2e-demo-password',
  databaseUrl: dbBase.toString(),
  adminDatabaseUrl: pick('DATABASE_URL', 'postgresql://unsaid:unsaid@localhost:5432/unsaid'),
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: E2E.baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node web/e2e/prepare-db.mjs && npx tsx src/index.ts',
    cwd: root,
    url: `${E2E.baseURL}/readyz`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      E2E_ADMIN_URL: E2E.adminDatabaseUrl,
      NODE_ENV: 'development',
      LOG_LEVEL: 'warn',
      PORT: String(PORT),
      MOCK_EXTERNALS: 'true',
      DATABASE_URL: E2E.databaseUrl,
      REDIS_URL: `${pick('REDIS_URL', 'redis://localhost:6379').replace(/\/\d+$/, '')}/3`,
      QDRANT_URL: pick('QDRANT_URL', 'http://localhost:6333'),
      QDRANT_COLLECTION_PREFIX: 'e2e_',
      QDRANT_ALLOW_RESET: 'true',
      EMBEDDING_DIM: '256',
      INGEST_WINDOW_SIZE: '2',
      API_KEY: E2E.apiKey,
      DEMO_EMAIL: E2E.email,
      DEMO_PASSWORD: E2E.password,
      SESSION_SECRET: 'e2e-session-secret-e2e-session-secret',
      OMI_WEBHOOK_SECRET: '',
      RATE_LIMIT_ENABLED: 'false',
      WEB_DIST: path.join(root, 'web/dist'),
      AUDIO_DIR: path.join(root, 'storage/e2e-audio'),
    },
  },
});
