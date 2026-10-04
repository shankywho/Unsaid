export interface TtsResult {
  /** Audio id; served at GET /v1/audio/:id */
  id: string;
}

export interface Tts {
  /** True when the audio is a silent placeholder: clients should speak the text themselves (browser speech). */
  readonly silent?: boolean;
  synthesize(text: string): Promise<TtsResult>;
}
