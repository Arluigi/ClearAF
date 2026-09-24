import { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

// Explicit allow-list of extra error detail fields safe to forward to the client. Add to this only
// for machine-readable, non-sensitive details (never message content, tokens or internal identifiers).
const ALLOWED_ERROR_DETAILS = ['nextAllowedAt'] as const;

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Do not log request paths, payloads, database arguments or signed image URLs.
  console.error('Request failed', { name: error.name, code: error.code || 'UNEXPECTED_ERROR', method: req.method });

  // Prisma database errors
  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'A record with this information already exists',
          code: 'DUPLICATE_RECORD',
          field: error.meta?.target
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Record not found',
          code: 'NOT_FOUND'
        });
      case 'P2003':
        return res.status(400).json({
          error: 'Foreign key constraint failed',
          code: 'FOREIGN_KEY_ERROR'
        });
      default:
        return res.status(500).json({
          error: 'Database error occurred',
          code: 'DATABASE_ERROR'
        });
    }
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }

  // Custom app errors. Only an explicitly allow-listed set of extra detail fields (e.g. the
  // machine-readable `nextAllowedAt`) is forwarded; anything else attached to the error is dropped.
  if (error.statusCode) {
    const details = Object.fromEntries(
      ALLOWED_ERROR_DETAILS
        .filter(key => key in error)
        .map(key => [key, (error as unknown as Record<string, unknown>)[key]])
    );
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code || 'APP_ERROR',
      ...details
    });
  }

  // Default error
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};
