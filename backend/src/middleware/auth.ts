import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface JwtPayload {
  userId: string;
  userType: 'patient' | 'dermatologist';
  email: string;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        userType: 'patient' | 'dermatologist';
        email: string;
      };
    }
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

    // Verify token
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    
    // Verify user still exists
    let user;
    if (decoded.userType === 'patient') {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, name: true }
      });
    } else {
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

    // Add user info to request
    req.user = {
      id: decoded.userId,
      userType: decoded.userType,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware to check if user is a dermatologist
export const requireDermatologist = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.userType !== 'dermatologist') {
    return res.status(403).json({ 
      error: 'Dermatologist access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Middleware to check if user is a patient
export const requirePatient = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.userType !== 'patient') {
    return res.status(403).json({ 
      error: 'Patient access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};