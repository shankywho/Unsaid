export interface TtsResult {
  /** Audio id; served at GET /v1/audio/:id */
  id: string;
}

export interface Tts {
  synthesize(text: string): Promise<TtsResult>;
}
