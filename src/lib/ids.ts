import { createHash, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();
export const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex');

/** Qdrant point ids must be uuid or uint; derive a stable uuid from any string. */
export function stableUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
