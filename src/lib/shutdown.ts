import type { Response } from 'express';

/** Flipped when SIGTERM/SIGINT is received so /readyz reports 503 while in-flight work drains. */
let shuttingDown = false;
export const isShuttingDown = (): boolean => shuttingDown;
export const markShuttingDown = (): void => {
  shuttingDown = true;
};

/** Open SSE responses; closed explicitly on shutdown because they would otherwise keep the server alive forever. */
export const sseClients = new Set<Response>();
