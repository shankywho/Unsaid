export const DAY_MS = 86_400_000;
export const nowIso = (): string => new Date().toISOString();
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
