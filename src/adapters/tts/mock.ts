import { saveAudio } from './storage';
import type { Tts, TtsResult } from './types';

// One silent MPEG-1 Layer III frame (128kbps, 44.1kHz), repeated: valid, playable, silent.
const FRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(413)]);

export class MockTts implements Tts {
  readonly silent = true;
  async synthesize(_text: string): Promise<TtsResult> {
    const id = await saveAudio(Buffer.concat(Array.from({ length: 20 }, () => FRAME)));
    return { id };
  }
}
