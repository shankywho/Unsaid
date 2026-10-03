import { createHash } from 'node:crypto';
import type { Embedder } from './types';

const STOP = new Set(
  'a an the and or but is are was were be been to of in on at for with by from it its this that these those i me my we our you your he she they them his her their as so do does did not no please about into'.split(
    ' ',
  ),
);

/** Light stemming so "visiting"/"visits"/"visit" collide. */
export function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, (m, _g, off: number) => (off >= 3 ? '' : m));
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map(stem);
}

/** Deterministic feature-hashing embedding: cosine ≈ token overlap. Good enough to make tests meaningful. */
export class MockEmbedder implements Embedder {
  constructor(public readonly dim: number) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.one(t));
  }

  private one(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0);
    for (const tok of tokenize(text)) {
      const h = createHash('md5').update(tok).digest();
      const idx = h.readUInt32BE(0) % this.dim;
      v[idx] += 1; // unsigned so overlap is always positive
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm === 0) v[0] = 1;
    else for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
  }
}
