import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type User = Schemas['User'];
export type Confirmation = Schemas['Confirmation'];
export type Run = Schemas['Run'];
export type RunDetail = Schemas['RunDetail'];
export type Step = Schemas['Step'];
export type WordMap = Schemas['WordMap'];
export type WordMapEntry = Schemas['WordMapEntry'];
export type MemoryFact = Schemas['MemoryFact'];
export type OmiStatus = Schemas['OmiStatus'];
export type Segment = Schemas['Segment'];
export type EventEnvelope = Schemas['EventEnvelope'];
export type Insights = Schemas['Insights'];

export const client = createClient<paths>({ baseUrl: '', credentials: 'include' });

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = 'unsaid:unauthorized';

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Unwrap an openapi-fetch result: throw ApiError carrying the backend's error envelope. */
export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  let r: Result<T>;
  try {
    r = await p;
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the Unsaid API. Check that the server is running.');
  }
  if (r.error !== undefined || !r.response.ok) {
    const env = (r.error as { error?: { code?: string; message?: string; requestId?: string } } | undefined)
      ?.error;
    if (r.response.status === 401 && !r.response.url.includes('/auth/login')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(
      r.response.status,
      env?.code ?? 'error',
      env?.message ?? `Request failed (${r.response.status})`,
      env?.requestId,
    );
  }
  return r.data as T;
}

export const errMessage = (e: unknown): string =>
  e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong';
