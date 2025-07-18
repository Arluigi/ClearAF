import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requirePatient } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const uploadPhotoSchema = z.object({
  photoUrl: z.string().url('Invalid photo URL'),
  skinScore: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  appointmentId: z.string().uuid().optional()
});

const updatePhotoSchema = z.object({
  skinScore: z.number().min(0).max(100).optional(),
  notes: z.string().optional()
});

// Upload/create photo record
router.post('/', requirePatient, async (req, res, next) => {
  try {
    const validatedData = uploadPhotoSchema.parse(req.body);
    const { photoUrl, skinScore, notes, appointmentId } = validatedData;

    // Verify appointment belongs to user if provided
    if (appointmentId) {
      const appointment = await prisma.appointment.findUnique({
        where: { 
          id: appointmentId,
          patientId: req.user!.id
        }
      });

      if (!appointment) {
        return res.status(404).json({
          error: 'Appointment not found or access denied',
          code: 'APPOINTMENT_NOT_FOUND'
        });
      }
    }

    // Create photo record
    const photo = await prisma.skinPhoto.create({
      data: {
        photoUrl,
        skinScore: skinScore || 0,
        notes,
        userId: req.user!.id,
        appointmentId
      },
      include: {
        relatedAppointment: {
          select: {
            id: true,
            scheduledDate: true,
            type: true
          }
        }
      }
    });

    // Update user's current skin score if provided
    if (skinScore !== undefined) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          currentSkinScore: skinScore,
          streakCount: {
            increment: 1
          }
        }
      });
    }

    res.status(201).json({
      message: 'Photo uploaded successfully',
      photo
    });

  } catch (error) {
    next(error);
  }
});

// Get user's photos
router.get('/', requirePatient, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy as string || 'captureDate';
    const order = req.query.order as string || 'desc';

    // Validate sort parameters
    const validSortFields = ['captureDate', 'skinScore'];
    const validOrder = ['asc', 'desc'];

    if (!validSortFields.includes(sortBy) || !validOrder.includes(order)) {
      return res.status(400).json({
        error: 'Invalid sort parameters',
        code: 'INVALID_SORT'
      });
    }

    const photos = await prisma.skinPhoto.findMany({
      where: { userId: req.user!.id },
      include: {
        relatedAppointment: {
          select: {
            id: true,
            scheduledDate: true,
            type: true,
            status: true
          }
        }
      },
      orderBy: {
        [sortBy]: order
      },
      skip,
      take: limit
    });

    const total = await prisma.skinPhoto.count({
      where: { userId: req.user!.id }
    });

    // Calculate progress data
    const recentPhotos = await prisma.skinPhoto.findMany({
      where: { userId: req.user!.id },
      orderBy: { captureDate: 'desc' },
      take: 10,
      select: {
        skinScore: true,
        captureDate: true
      }
    });

    const progressData = recentPhotos.map(photo => ({
      score: photo.skinScore,
      date: photo.captureDate
    }));

    res.json({
      photos,
      progressData,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Get specific photo
router.get('/:id', requirePatient, async (req, res, next) => {
  try {
    const { id } = req.params;

    const photo = await prisma.skinPhoto.findUnique({
      where: { 
        id,
        userId: req.user!.id  // Ensure user owns the photo
      },
      include: {
        relatedAppointment: {
          select: {
            id: true,
            scheduledDate: true,
            type: true,
            status: true,
            dermatologist: {
              select: {
                id: true,
                name: true,
                title: true
              }
            }
          }
        }
      }
    });

    if (!photo) {
      return res.status(404).json({
        error: 'Photo not found',
        code: 'PHOTO_NOT_FOUND'
      });
    }

    res.json({ photo });

  } catch (error) {
    next(error);
  }
});

// Update photo details
router.patch('/:id', requirePatient, async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updatePhotoSchema.parse(req.body);

    // Verify photo belongs to user
    const existingPhoto = await prisma.skinPhoto.findUnique({
      where: { 
        id,
        userId: req.user!.id
      }
    });

    if (!existingPhoto) {
      return res.status(404).json({
        error: 'Photo not found',
        code: 'PHOTO_NOT_FOUND'
      });
    }

    const updatedPhoto = await prisma.skinPhoto.update({
      where: { id },
      data: validatedData,
      include: {
        relatedAppointment: {
          select: {
            id: true,
            scheduledDate: true,
            type: true
          }
        }
      }
    });

    // Update user's current skin score if provided
    if (validatedData.skinScore !== undefined) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          currentSkinScore: validatedData.skinScore
        }
      });
    }

    res.json({
      message: 'Photo updated successfully',
      photo: updatedPhoto
    });

  } catch (error) {
    next(error);
  }
});

// Delete photo
router.delete('/:id', requirePatient, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify photo belongs to user
    const photo = await prisma.skinPhoto.findUnique({
      where: { 
        id,
        userId: req.user!.id
      }
    });

    if (!photo) {
      return res.status(404).json({
        error: 'Photo not found',
        code: 'PHOTO_NOT_FOUND'
      });
    }

    await prisma.skinPhoto.delete({
      where: { id }
    });

    res.json({
      message: 'Photo deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Get photo timeline/progress
router.get('/timeline/progress', requirePatient, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const photos = await prisma.skinPhoto.findMany({
      where: {
        userId: req.user!.id,
        captureDate: {
          gte: startDate
        }
      },
      select: {
        id: true,
        skinScore: true,
        captureDate: true,
        notes: true,
        photoUrl: true
      },
      orderBy: {
        captureDate: 'asc'
      }
    });

    // Group photos by week for better visualization
    const weeklyData = photos.reduce((acc: any, photo) => {
      const week = Math.floor((Date.now() - photo.captureDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
      if (!acc[week]) {
        acc[week] = [];
      }
      acc[week].push(photo);
      return acc;
    }, {});

    // Calculate average scores and trends
    const scores = photos.map(p => p.skinScore);
    const averageScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    // Calculate trend (simple linear regression slope)
    let trend = 0;
    if (scores.length > 1) {
      const n = scores.length;
      const sumX = (n * (n - 1)) / 2;
      const sumY = scores.reduce((a, b) => a + b, 0);
      const sumXY = scores.reduce((sum, score, index) => sum + (score * index), 0);
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
      
      trend = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    res.json({
      timeline: {
        photos,
        weeklyData,
        stats: {
          totalPhotos: photos.length,
          averageScore,
          trend: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable',
          trendValue: trend
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;