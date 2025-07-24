import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requirePatient, requireDermatologist } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, generatePhotoKey, getS3PublicUrl } from '../config/s3';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage (S3 upload)
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
};

// Multer configuration for S3 upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload
  }
});

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

// File upload endpoint - uploads to S3 and stores URL in database
router.post('/upload', requirePatient, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No photo file provided',
        code: 'NO_FILE'
      });
    }

    // Parse optional form data
    const skinScore = req.body.skinScore ? parseInt(req.body.skinScore) : 0;
    const notes = req.body.notes || '';
    const appointmentId = req.body.appointmentId || null;

    // Validate skin score if provided
    if (skinScore < 0 || skinScore > 100) {
      return res.status(400).json({
        error: 'Skin score must be between 0 and 100',
        code: 'INVALID_SKIN_SCORE'
      });
    }

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

    // Generate S3 key for the photo
    const s3Key = generatePhotoKey(req.user!.id, req.file.originalname);

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        userId: req.user!.id,
        originalName: req.file.originalname,
        skinScore: skinScore.toString(),
        uploadDate: new Date().toISOString()
      }
    });

    try {
      await s3Client.send(uploadCommand);
    } catch (s3Error) {
      console.error('S3 upload failed:', s3Error);
      return res.status(500).json({
        error: 'Failed to upload photo to storage',
        code: 'S3_UPLOAD_FAILED'
      });
    }

    // Get public S3 URL
    const photoUrl = getS3PublicUrl(s3Key);

    // Create photo record in database
    const photo = await prisma.skinPhoto.create({
      data: {
        photoUrl,
        skinScore,
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

    // Update user's current skin score and streak if skin score provided
    if (skinScore > 0) {
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
      message: 'Photo uploaded successfully to S3',
      photo: {
        ...photo,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        s3Key: s3Key
      }
    });

  } catch (error) {
    next(error);
  }
});

// Upload/create photo record (existing endpoint - for URL-based uploads)
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

// Get patient photos (dermatologists only)
router.get('/patient/:patientId', requireDermatologist, async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Verify patient is assigned to this dermatologist
    const patient = await prisma.user.findUnique({
      where: { 
        id: patientId,
        dermatologistId: req.user!.id // Ensure patient belongs to this dermatologist
      }
    });

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found or not assigned to you',
        code: 'PATIENT_NOT_FOUND'
      });
    }

    // Fetch patient's photos
    const photos = await prisma.skinPhoto.findMany({
      where: { userId: patientId },
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
      orderBy: { captureDate: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.skinPhoto.count({
      where: { userId: patientId }
    });

    res.json({
      data: photos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Get patient photo timeline (dermatologists only)
router.get('/patient/:patientId/timeline', requireDermatologist, async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Verify patient is assigned to this dermatologist
    const patient = await prisma.user.findUnique({
      where: { 
        id: patientId,
        dermatologistId: req.user!.id
      }
    });

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found or not assigned to you',
        code: 'PATIENT_NOT_FOUND'
      });
    }

    const photos = await prisma.skinPhoto.findMany({
      where: {
        userId: patientId,
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

    // Calculate stats
    const scores = photos.map(p => p.skinScore);
    const averageScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    // Calculate trend
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