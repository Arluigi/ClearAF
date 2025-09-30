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

// Sync user profile after Supabase registration
router.post('/sync-profile', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get Dr. Amit Om's ID (find first available dermatologist)
    const drAmit = await prisma.dermatologist.findFirst({
      where: { email: 'dr.amitom@clearaf.com' }
    });

    if (!drAmit) {
      return res.status(500).json({ error: 'No dermatologist available' });
    }

    // Create or update user profile with dermatologist assignment
    const userProfile = await prisma.user.upsert({
      where: { id: user.id },
      update: {
        // Update existing profile if needed
        dermatologistId: drAmit.id
      },
      create: {
        id: user.id,
        name: user.user_metadata?.name || null,
        skinType: user.user_metadata?.skinType || null,
        dermatologistId: drAmit.id,  // Auto-assign to Dr. Amit Om
        onboardingCompleted: false
      }
    });

    res.json({
      success: true,
      user: {
        id: userProfile.id,
        name: userProfile.name,
        skinType: userProfile.skinType,
        dermatologistId: userProfile.dermatologistId
      },
      assignedDermatologist: {
        id: drAmit.id,
        name: drAmit.name
      }
    });
  } catch (error) {
    console.error('Error syncing profile:', error);
    next(error);
  }
});

export default router;