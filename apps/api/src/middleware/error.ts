import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../logger.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

/** Consistent error envelope: { error: { code, message, details? } }. Internals are never leaked. */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    let e: AppError;
    if (err instanceof AppError) e = err;
    else if (err instanceof mongoose.Error.CastError) e = new AppError(400, 'bad_request', `Invalid value for ${err.path}`);
    else if (err instanceof mongoose.Error.ValidationError) {
      e = new AppError(400, 'bad_request', 'Validation failed', Object.values(err.errors).map((x) => ({ path: x.path, message: x.message })));
    } else if ((err as { code?: number })?.code === 11000) e = new AppError(409, 'conflict', 'A record with these values already exists');
    else if ((err as { type?: string })?.type === 'entity.too.large') e = new AppError(413, 'payload_too_large', 'Request body too large');
    else if ((err as { type?: string })?.type === 'entity.parse.failed') e = new AppError(400, 'bad_request', 'Malformed JSON');
    else if ((err as { code?: string })?.code === 'LIMIT_FILE_SIZE') e = new AppError(413, 'file_too_large', 'Files are limited to 10 MB');
    else e = new AppError(500, 'internal_error', 'Something went wrong');

    if (e.status >= 500) logger.error({ err, path: req.path, method: req.method }, 'request failed');
    res.status(e.status).json({ error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } });
  };
}
