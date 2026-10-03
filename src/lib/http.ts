import { sleep } from './time';

export interface FetchOpts extends RequestInit {
  timeoutMs: number;
  retries?: number;
}

/** fetch with timeout; retries (exponential backoff) on network errors and 5xx only. */
export async function fetchRetry(url: string, opts: FetchOpts): Promise<Response> {
  const { timeoutMs, retries = 2, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await sleep(200 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
