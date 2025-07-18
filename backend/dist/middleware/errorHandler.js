"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const library_1 = require("@prisma/client/runtime/library");
const zod_1 = require("zod");
const errorHandler = (error, req, res, next) => {
    console.error('Error occurred:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    if (error instanceof library_1.PrismaClientKnownRequestError) {
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
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message
            }))
        });
    }
    if (error.statusCode) {
        return res.status(error.statusCode).json({
            error: error.message,
            code: error.code || 'APP_ERROR'
        });
    }
    return res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map