import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const TEST_DB = 'unsaid_test';

export function testDatabaseUrl(base: string): string {
  const u = new URL(base);
  u.pathname = `/${TEST_DB}`;
  return u.toString();
}

export default async function setup(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL missing (copy .env.example to .env)');
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB}`);
  } catch {
    /* already exists */
  } finally {
    await admin.$disconnect();
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(base) },
  });
}
