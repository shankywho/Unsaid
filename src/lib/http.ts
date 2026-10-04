import { sleep } from './time';

export interface FetchOpts extends RequestInit {
  timeoutMs: number;
  retries?: number;
}

/** fetch with timeout; retries (exponential backoff) on network errors, 429 rate limits, and 5xx. */
export async function fetchRetry(url: string, opts: FetchOpts): Promise<Response> {
  const { timeoutMs, retries = 3, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status < 500 && res.status !== 429) return res;
      if (res.status === 429) {
        const retryHeader = res.headers.get('retry-after');
        const retrySec = retryHeader ? Number.parseFloat(retryHeader) : NaN;
        if (!Number.isNaN(retrySec) && retrySec > 30) {
          lastErr = new Error(`HTTP 429 Rate limited (retry-after ${retrySec}s exceeded max wait)`);
          break;
        }
        const waitMs =
          !Number.isNaN(retrySec) && retrySec > 0 ? Math.ceil(retrySec * 1000) : 2000 * (attempt + 1);
        if (attempt < retries) {
          await sleep(waitMs);
          continue;
        }
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await sleep(500 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
