import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  userType: z.enum(['patient', 'dermatologist']),
  // Optional fields for patients
  skinType: z.string().optional(),
  skinConcerns: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  userType: z.enum(['patient', 'dermatologist'])
});

// Helper function to generate JWT
const generateToken = (userId: string, userType: 'patient' | 'dermatologist', email: string) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }
  
  return jwt.sign(
    { userId, userType, email },
    jwtSecret,
    { expiresIn: '7d' }
  );
};

// Register endpoint
router.post('/register', async (req, res, next) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { name, email, password, userType, skinType, skinConcerns } = validatedData;

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    let user;
    if (userType === 'patient') {
      // Create patient user
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          skinType,
          skinConcerns,
          onboardingCompleted: false
        },
        select: {
          id: true,
          name: true,
          email: true,
          skinType: true,
          onboardingCompleted: true,
          createdAt: true
        }
      });
    } else {
      // Create dermatologist user
      user = await prisma.dermatologist.create({
        data: {
          name,
          email,
          password: hashedPassword,
          title: 'Dr.',
          specialization: 'Dermatology',
          isAvailable: true
        },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          specialization: true,
          isAvailable: true,
          createdAt: true
        }
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, userType, email);

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token,
      userType
    });

  } catch (error) {
    next(error);
  }
});

// Login endpoint
router.post('/login', async (req, res, next) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password, userType } = validatedData;

    let user;
    if (userType === 'patient') {
      user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          password: true,
          skinType: true,
          currentSkinScore: true,
          streakCount: true,
          onboardingCompleted: true,
          assignedDermatologist: {
            select: {
              id: true,
              name: true,
              title: true,
              specialization: true
            }
          }
        }
      });
    } else {
      user = await prisma.dermatologist.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          password: true,
          title: true,
          specialization: true,
          isAvailable: true,
          patients: {
            select: {
              id: true,
              name: true,
              email: true,
              currentSkinScore: true
            }
          }
        }
      });
    }

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Generate JWT token
    const token = generateToken(user.id, userType, email);

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token,
      userType
    });

  } catch (error) {
    next(error);
  }
});

// Get current user endpoint (verify token)
router.get('/me', async (req, res, next) => {
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

    const decoded = jwt.verify(token, jwtSecret) as any;
    
    let user;
    if (decoded.userType === 'patient') {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          name: true,
          email: true,
          skinType: true,
          currentSkinScore: true,
          streakCount: true,
          onboardingCompleted: true,
          assignedDermatologist: {
            select: {
              id: true,
              name: true,
              title: true,
              specialization: true
            }
          }
        }
      });
    } else {
      user = await prisma.dermatologist.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          specialization: true,
          isAvailable: true
        }
      });
    }

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user,
      userType: decoded.userType
    });

  } catch (error) {
    next(error);
  }
});

export default router;