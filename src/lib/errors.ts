export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found`);
export const badRequest = (msg: string) => new AppError(400, 'bad_request', msg);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);
export const unauthorized = (msg = 'authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'forbidden') => new AppError(403, 'forbidden', msg);
