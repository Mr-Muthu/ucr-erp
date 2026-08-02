import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

// Zod throws synchronously; Express's default error handling (no async
// wrapper needed) routes it straight to errorHandler.ts, which formats it
// as { code: 'VALIDATION_ERROR', message, field }.
export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body) as z.infer<T>;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.query = schema.parse(req.query) as never;
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.params = schema.parse(req.params) as never;
    next();
  };
}
