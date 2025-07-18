"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePatient = exports.requireDermatologist = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                code: 'NO_TOKEN'
            });
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET not configured');
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        let user;
        if (decoded.userType === 'patient') {
            user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, email: true, name: true }
            });
        }
        else {
            user = await prisma.dermatologist.findUnique({
                where: { id: decoded.userId },
                select: { id: true, email: true, name: true }
            });
        }
        if (!user) {
            return res.status(401).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        req.user = {
            id: decoded.userId,
            userType: decoded.userType,
            email: decoded.email
        };
        return next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
            return;
        }
        console.error('Auth middleware error:', error);
        res.status(500).json({
            error: 'Authentication error',
            code: 'AUTH_ERROR'
        });
        return;
    }
};
exports.authenticateToken = authenticateToken;
const requireDermatologist = (req, res, next) => {
    if (!req.user || req.user.userType !== 'dermatologist') {
        return res.status(403).json({
            error: 'Dermatologist access required',
            code: 'INSUFFICIENT_PERMISSIONS'
        });
    }
    return next();
};
exports.requireDermatologist = requireDermatologist;
const requirePatient = (req, res, next) => {
    if (!req.user || req.user.userType !== 'patient') {
        return res.status(403).json({
            error: 'Patient access required',
            code: 'INSUFFICIENT_PERMISSIONS'
        });
    }
    return next();
};
exports.requirePatient = requirePatient;
//# sourceMappingURL=auth.js.map