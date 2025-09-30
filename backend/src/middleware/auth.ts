import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { supabaseAdmin } from '../config/supabase';

const prisma = new PrismaClient();

interface SupabaseJwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  aud: string;
  exp: number;
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

    // Verify Supabase JWT token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if user is a dermatologist or patient
    // Dermatologists have separate table, patients use user_profiles
    const dermatologist = await prisma.dermatologist.findUnique({
      where: { email: user.email! },
      select: { id: true, email: true, name: true }
    });

    if (dermatologist) {
      req.user = {
        id: dermatologist.id,
        userType: 'dermatologist',
        email: dermatologist.email
      };
    } else {
      // Patient - use Supabase auth user ID
      req.user = {
        id: user.id,
        userType: 'patient',
        email: user.email!
      };
    }

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
    return;
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
  return next();
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
  return next();
};