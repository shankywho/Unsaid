// Fresh, isolated database for the e2e backend. Runs before the server starts (see playwright.config.ts).
import { execSync } from 'node:child_process';

const admin = process.env.E2E_ADMIN_URL;
const target = process.env.DATABASE_URL;
const run = (sql) =>
  execSync(`npx prisma db execute --stdin --url "${admin}"`, {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
try {
  run('DROP DATABASE IF EXISTS unsaid_e2e WITH (FORCE);');
} catch {
  /* nothing to drop */
}
run('CREATE DATABASE unsaid_e2e;');
execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: target } });
