import fs from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { MockEmbedder } from '../src/adapters/embeddings/mock';
import { MockTts } from '../src/adapters/tts/mock';
import { audioPath } from '../src/adapters/tts/storage';
import { extractReply } from '../src/adapters/lyzr/httpClient';
import { bootstrapQdrant, collections } from '../src/adapters/qdrant/collections';
import { qdrant } from '../src/adapters/qdrant/client';
import { parseMemoryBody, parseTranscriptBody } from '../src/adapters/omi/schemas';
import { HttpOmiNotifier } from '../src/adapters/omi/notifier';

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe('MockEmbedder', () => {
  const e = new MockEmbedder(256);
  it('is deterministic and unit-length', async () => {
    const [a, b] = await e.embed(['Priya visiting Sunday', 'Priya visiting Sunday']);
    expect(a).toEqual(b);
    expect(cos(a, a)).toBeCloseTo(1, 5);
  });
  it('ranks token overlap above unrelated text', async () => {
    const [q, near, far] = await e.embed([
      'priya sunday cake',
      'Priya is visiting on Sunday',
      'water bill due Monday',
    ]);
    expect(cos(q, near)).toBeGreaterThan(cos(q, far));
  });
  it('stems simple inflections', async () => {
    const [a, b] = await e.embed(['visiting', 'visits']);
    expect(cos(a, b)).toBeGreaterThan(0.99);
  });
});

describe('MockTts', () => {
  it('writes a playable mp3 file', async () => {
    const { id } = await new MockTts().synthesize('hello');
    expect(fs.statSync(audioPath(id)).size).toBeGreaterThan(1000);
  });
});

describe('lyzr reply parsing', () => {
  it('prefers response, then message, then output', () => {
    expect(extractReply({ response: 'a', message: 'b' })).toBe('a');
    expect(extractReply({ message: 'b', output: 'c' })).toBe('b');
    expect(extractReply({ output: 'c' })).toBe('c');
    expect(() => extractReply({})).toThrow();
  });
});

describe('omi schemas', () => {
  it('parses object, bare-array and tolerates extras / missing fields', () => {
    expect(
      parseTranscriptBody({ session_id: 's', segments: [{ text: 'hi', extra: 1 }] })?.segments,
    ).toHaveLength(1);
    expect(parseTranscriptBody([{ text: 'hi', is_user: true }])?.segments[0].is_user).toBe(true);
    expect(parseTranscriptBody({})?.segments).toEqual([]);
  });
  it('rejects garbage without throwing', () => {
    expect(parseTranscriptBody('nope')).toBeNull();
    expect(parseTranscriptBody({ segments: 'x' })).toBeNull();
    expect(parseMemoryBody(42)).toBeNull();
  });
  it('parses memory payloads', () => {
    const m = parseMemoryBody({ transcript_segments: [{ text: 'a' }], structured: { title: 't' }, foo: 1 });
    expect(m?.transcript_segments).toHaveLength(1);
  });
});

describe('OmiNotifier', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is a no-op when unconfigured', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await new HttpOmiNotifier().notify('u', 'hi');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('qdrant bootstrap', () => {
  it('is idempotent and creates both collections', async () => {
    await bootstrapQdrant(256);
    await bootstrapQdrant(256);
    const names = (await qdrant.getCollections()).collections.map((c) => c.name);
    expect(names).toContain(collections.memory);
    expect(names).toContain(collections.wordmap);
    expect(collections.memory.startsWith('test_')).toBe(true);
  });
});
