import { env } from '../config/env';
import type { Embedder } from './embeddings/types';
import { MockEmbedder } from './embeddings/mock';
import { OpenAIEmbedder } from './embeddings/openai';
import type { LyzrClient } from './lyzr/types';
import { HttpLyzrClient } from './lyzr/httpClient';
import { MockLyzrClient } from './lyzr/mock';
import { GroqClient } from './groq/client';
import { HttpOmiNotifier, MockOmiNotifier, type OmiNotifier } from './omi/notifier';
import type { Tts } from './tts/types';
import { MockTts } from './tts/mock';
import { OpenAITts } from './tts/openai';

export interface Adapters {
  lyzr: LyzrClient;
  embedder: Embedder;
  tts: Tts;
  omi: OmiNotifier;
}

export function createAdapters(mock: boolean = env.MOCK_EXTERNALS): Adapters {
  if (mock) {
    return {
      lyzr: new MockLyzrClient(),
      embedder: new MockEmbedder(env.EMBEDDING_DIM),
      tts: new MockTts(),
      omi: new MockOmiNotifier(),
    };
  }

  const lyzrClient: LyzrClient =
    env.GROQ_API_KEY && (!env.LYZR_AGENT_FRAGMENT_ID || env.LLM_PROVIDER === 'groq')
      ? new GroqClient()
      : new HttpLyzrClient();

  const embedder: Embedder = env.OPENAI_API_KEY ? new OpenAIEmbedder() : new MockEmbedder(env.EMBEDDING_DIM);

  const tts: Tts = env.OPENAI_API_KEY ? new OpenAITts() : new MockTts();

  return {
    lyzr: lyzrClient,
    embedder,
    tts,
    omi: new HttpOmiNotifier(),
  };
}

/** Process-wide adapters; tests may replace via setAdapters. */
let current: Adapters | undefined;
export const adapters = (): Adapters => (current ??= createAdapters());
export const setAdapters = (a: Adapters): void => {
  current = a;
};
