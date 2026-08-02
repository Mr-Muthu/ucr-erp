import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';

// Prisma errors never leak to the client — translated to the structured
// { code, message, field? } shape like everything else.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    const body: { code: string; message: string; field?: string } = { code: err.code, message: err.message };
    if (err.field) body.field = err.field;
    return res.status(err.statusCode).json(body);
  }

  if (err instanceof ZodError) {
    const first = err.errors[0];
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: first?.message ?? 'Validation failed',
      field: first?.path.join('.'),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : String(err.meta?.target ?? '');
      return res.status(409).json({ code: 'CONFLICT', message: `A record with this ${target} already exists`, field: target });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ code: 'CONFLICT', message: 'This record is referenced by other data and cannot be modified this way' });
    }
    // Postgres exclusion-constraint violation surfaces via raw driver error
    // with SQLSTATE 23P01, wrapped by Prisma as an unknown/known request error
    // depending on version — check the message text as a fallback.
  }

  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('23P01') || message.toLowerCase().includes('already deployed') || message.toLowerCase().includes('already has an active booking')) {
    return res.status(409).json({ code: 'CONFLICT', message: 'This vehicle is already booked or deployed for the selected window' });
  }

  (req as Request & { log?: { error: (obj: unknown, msg: string) => void } }).log?.error({ err }, 'Unhandled error');
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
}
