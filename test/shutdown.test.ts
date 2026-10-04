import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const PORT = 18080 + Math.floor(Math.random() * 500);
const root = path.resolve(__dirname, '..');

const waitFor = async (fn: () => Promise<boolean>, ms: number): Promise<void> => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timeout waiting for condition');
};

const get = (p: string): Promise<number> =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });

describe('Phase B — graceful shutdown (real process)', () => {
  it('on SIGTERM: ends SSE streams, drains workers, closes Prisma/Redis and exits 0 on its own', async () => {
    const child = spawn(process.execPath, ['--require', 'tsx/cjs', 'src/index.ts'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', LOG_LEVEL: 'info' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      child.on('exit', (code, signal) => resolve({ code, signal })),
    );

    try {
      await waitFor(async () => (await get('/healthz')) === 200, 30_000);

      // Hold an SSE stream open: a naive server.close() would hang forever on it.
      let sseEnded = false;
      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          {
            host: '127.0.0.1',
            port: PORT,
            path: '/v1/stream?userId=u1',
            headers: { authorization: 'Bearer test-key' },
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            res.on('data', () => resolve());
            res.on('end', () => (sseEnded = true));
            res.on('close', () => (sseEnded = true));
          },
        );
        req.on('error', reject);
      });

      const t0 = Date.now();
      child.kill('SIGTERM');
      const { code, signal } = await exited;
      expect({ code, signal }).toEqual({ code: 0, signal: null });
      expect(Date.now() - t0).toBeLessThan(15_000);
      expect(sseEnded).toBe(true);
      await expect(get('/healthz')).rejects.toBeTruthy(); // port closed
      expect(out).not.toMatch(/deadline exceeded|shutdown step failed/);
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }, 60_000);
});
