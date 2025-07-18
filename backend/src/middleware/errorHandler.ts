import { Request, Response, NextFunction } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

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

  // Custom app errors
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code || 'APP_ERROR'
    });
  }

  // Default error
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};