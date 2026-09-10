import express from 'express';
import { authenticateToken, requirePatient } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { prisma } from '../config/database';

const router = express.Router();


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
router.post('/sync-profile', authenticateToken, requirePatient, async (req, res, next) => {
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

    // Never let profile synchronization change a practice-managed assignment.
    const userProfile = await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        name: user.user_metadata?.name || null,
        skinType: user.user_metadata?.skinType || null,
        onboardingCompleted: false
      },
      include: { assignedDermatologist: { select: { id: true, name: true } } }
    });
    res.json({
      success: true,
      user: { id: userProfile.id, name: userProfile.name, skinType: userProfile.skinType, dermatologistId: userProfile.dermatologistId },
      assignedDermatologist: userProfile.assignedDermatologist ?? null
    });
  } catch (error) {
    console.error('Operation failed');
    next(error);
  }
});

export default router;
