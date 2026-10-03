export interface Embedder {
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}
