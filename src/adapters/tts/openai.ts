import { env } from '../../config/env';
import { fetchRetry } from '../../lib/http';
import { saveAudio } from './storage';
import type { Tts, TtsResult } from './types';

export class OpenAITts implements Tts {
  async synthesize(text: string): Promise<TtsResult> {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    const res = await fetchRetry('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      timeoutMs: 15_000,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.TTS_MODEL,
        voice: env.TTS_VOICE,
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
    return { id: await saveAudio(Buffer.from(await res.arrayBuffer())) };
  }
}
