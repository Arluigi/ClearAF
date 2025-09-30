import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Note: Actual authentication (signup/login) is handled by Supabase Auth
// These endpoints are for backend-specific operations

// Get auth status
router.get('/status', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.json({ authenticated: false });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Health check
router.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    auth: 'supabase',
    timestamp: new Date().toISOString()
  });
});

export default router;