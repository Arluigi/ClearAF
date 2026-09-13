import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requirePatient, requireDermatologist } from '../middleware/auth';
import multer from 'multer';
import { privatePhoto, privatePhotos, deletePhotoObject, ownedPhotoPath } from '../services/photoAccess';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, PHOTO_BUCKET, generatePhotoPath } from '../config/supabase';
import { captureIdentity, isMissingStorageObject, isValidCaptureObject } from '../services/photoCapture';
import { parsePagination } from '../services/pagination';

const router = express.Router();


// Configure multer for memory storage (Supabase Storage upload)
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req: any, file: any, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
};

// Multer configuration for Supabase Storage upload
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

const captureIdSchema = z.string().uuid();
const captureIntentSchema = z.object({}).strict();
const captureDateSchema = z.string().datetime({ offset: true }).refine(value => {
  if (!Number.isFinite(Date.parse(value))) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
}, 'Invalid capture date');
const completeCaptureSchema = z.object({
  captureDate: captureDateSchema,
  notes: z.string().max(10000)
}).strict();

function captureConflict(photo: { userId: string; photoUrl: string }, ownerId: string, storagePath: string): boolean {
  return photo.userId !== ownerId || photo.photoUrl !== storagePath;
}

async function captureObjectInfo(storagePath: string) {
  const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).info(storagePath);
  if (error) {
    if (isMissingStorageObject(error)) return { state: 'missing' as const };
    throw new Error('Unable to verify photo upload');
  }
  if (!data || !isValidCaptureObject(data)) return { state: 'invalid' as const };
  return { state: 'uploaded' as const };
}

router.post('/captures/:captureId/upload-url', requirePatient, async (req, res, next) => {
  try {
    const captureId = captureIdSchema.parse(req.params.captureId);
    captureIntentSchema.parse(req.body);
    const { id, storagePath } = captureIdentity(req.user!.id, captureId);
    const existing = await prisma.skinPhoto.findUnique({ where: { id } });
    if (existing) {
      if (captureConflict(existing, req.user!.id, storagePath)) {
        return res.status(409).json({ error: 'Photo capture conflict', code: 'CAPTURE_CONFLICT' });
      }
      return res.json({ photo: await privatePhoto(existing, req.user!.id) });
    }

    const object = await captureObjectInfo(storagePath);
    if (object.state === 'uploaded') return res.json({ storagePath, uploaded: true });
    if (object.state === 'invalid') {
      return res.status(400).json({ error: 'Upload is not a JPEG between 1 byte and 10 MB', code: 'INVALID_UPLOAD' });
    }

    const { data, error } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.signedUrl) throw new Error('Unable to authorize photo upload');
    return res.json({ storagePath, signedUrl: data.signedUrl });
  } catch (error) {
    return next(error);
  }
});

router.post('/captures/:captureId/complete', requirePatient, async (req, res, next) => {
  try {
    const captureId = captureIdSchema.parse(req.params.captureId);
    const input = completeCaptureSchema.parse(req.body);
    const { id, storagePath } = captureIdentity(req.user!.id, captureId);
    const existing = await prisma.skinPhoto.findUnique({ where: { id } });
    if (existing) {
      if (captureConflict(existing, req.user!.id, storagePath)) {
        return res.status(409).json({ error: 'Photo capture conflict', code: 'CAPTURE_CONFLICT' });
      }
      return res.json({ photo: await privatePhoto(existing, req.user!.id) });
    }

    const object = await captureObjectInfo(storagePath);
    if (object.state !== 'uploaded') {
      return res.status(400).json({ error: 'Upload is missing or is not a JPEG between 1 byte and 10 MB', code: 'INVALID_UPLOAD' });
    }

    try {
      const photo = await prisma.$transaction(tx => tx.skinPhoto.create({
        data: {
          id,
          photoUrl: storagePath,
          skinScore: 0,
          notes: input.notes,
          captureDate: new Date(input.captureDate),
          userId: req.user!.id
        }
      }));
      return res.status(201).json({ photo: await privatePhoto(photo, req.user!.id) });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const winner = await prisma.skinPhoto.findUnique({ where: { id } });
      if (!winner || captureConflict(winner, req.user!.id, storagePath)) throw error;
      return res.json({ photo: await privatePhoto(winner, req.user!.id) });
    }
  } catch (error) {
    return next(error);
  }
});

// Large images travel directly to private Storage instead of through Vercel's
// request-size limit. Only the server chooses the owner-bound object path.
router.post('/upload-url', requirePatient, async (req, res, next) => {
  try {
    const { mimeType } = z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).parse(req.body);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
    const storagePath = generatePhotoPath(req.user!.id, `photo.${extension}`);
    const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.signedUrl) throw new Error('Unable to authorize photo upload');
    res.json({ storagePath, signedUrl: data.signedUrl });
  } catch (error) { next(error); }
});

router.post('/complete-upload', requirePatient, async (req, res, next) => {
  try {
    const input = z.object({
      storagePath: z.string(), skinScore: z.number().int().min(0).max(100).default(0),
      notes: z.string().max(10000).default(''), appointmentId: z.string().uuid().optional()
    }).parse(req.body);
    let path: string;
    try { path = ownedPhotoPath(input.storagePath, req.user!.id); }
    catch { return res.status(400).json({ error: 'Invalid upload path', code: 'INVALID_UPLOAD' }); }
    const id = path.split('/')[1].split('.')[0];
    if (!z.string().uuid().safeParse(id).success || input.storagePath !== path) {
      return res.status(400).json({ error: 'A server-generated upload path is required', code: 'INVALID_UPLOAD' });
    }
    const { data: object, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).info(path);
    if (error || !object || object.size <= 0 || object.size > 10 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(object.contentType)) {
      return res.status(400).json({ error: 'Upload is missing or is not an image under 10 MB', code: 'INVALID_UPLOAD' });
    }
    if (input.appointmentId && !await prisma.appointment.findUnique({ where: { id: input.appointmentId, patientId: req.user!.id } })) {
      return res.status(404).json({ error: 'Appointment not found', code: 'APPOINTMENT_NOT_FOUND' });
    }
    const existing = await prisma.skinPhoto.findUnique({ where: { id } });
    if (existing) {
      if (existing.userId !== req.user!.id || existing.photoUrl !== path) return res.status(409).json({ error: 'Upload conflict', code: 'UPLOAD_CONFLICT' });
      return res.json({ message: 'Photo already uploaded', photo: await privatePhoto(existing, req.user!.id) });
    }
    try {
      const photo = await prisma.$transaction(async tx => {
        const created = await tx.skinPhoto.create({ data: { id, userId: req.user!.id, photoUrl: path, skinScore: input.skinScore, notes: input.notes, appointmentId: input.appointmentId } });
        if (input.skinScore > 0) await tx.user.update({ where: { id: req.user!.id }, data: { currentSkinScore: input.skinScore, streakCount: { increment: 1 } } });
        return created;
      });
      res.status(201).json({ message: 'Photo uploaded successfully', photo: await privatePhoto(photo, req.user!.id) });
    } catch (error) {
      // A concurrent completion can win the insert; return that same authorized
      // record instead of duplicating it or applying score changes twice.
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const winner = await prisma.skinPhoto.findUnique({ where: { id } });
      if (!winner || winner.userId !== req.user!.id || winner.photoUrl !== path) throw error;
      res.json({ message: 'Photo already uploaded', photo: await privatePhoto(winner, req.user!.id) });
    }
  } catch (error) { next(error); }
});

// File upload endpoint - uploads to Supabase Storage and stores URL in database
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

    // Generate file path for Supabase Storage
    const filePath = generatePhotoPath(req.user!.id, req.file.originalname);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          userId: req.user!.id,
          originalName: req.file.originalname,
          skinScore: skinScore.toString(),
          uploadDate: new Date().toISOString()
        }
      });

    if (uploadError) {
      console.error('Operation failed');
      return res.status(500).json({
        error: 'Failed to upload photo to storage',
        code: 'STORAGE_UPLOAD_FAILED',
        details: uploadError.message
      });
    }

    // Persist only an object path; signed URLs are generated per authorized response.
    const photoUrl = filePath;

    // Create photo record in database
    const photo = await prisma.skinPhoto.create({
      data: {
        id: filePath.split('/')[1].split('.')[0],
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
      message: 'Photo uploaded successfully to Supabase Storage',
      photo: {
        ...await privatePhoto(photo, req.user!.id),
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        storagePath: filePath
      }
    });

  } catch (error) {
    next(error);
  }
});

// Arbitrary URLs could point at another patient's object. Upload bytes instead.
router.post('/', requirePatient, (_req, res) => {
  res.status(410).json({ error: 'Use the authenticated photo upload endpoint', code: 'URL_UPLOAD_REMOVED' });
});

// Get user's photos
router.get('/', requirePatient, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 20);
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
      orderBy: [{ captureDate: 'desc' }, { id: 'desc' }],
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
      photos: await privatePhotos(photos, req.user!.id),
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

    res.json({ photo: await privatePhoto(photo, req.user!.id) });

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
      photo: await privatePhoto(updatedPhoto, req.user!.id)
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

    await deletePhotoObject(photo);
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

    const sharedPhotos = await privatePhotos(photos, req.user!.id);

    // Group photos by week for better visualization
    const weeklyData = sharedPhotos.reduce((acc: any, photo) => {
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
        photos: sharedPhotos,
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
    const { page, limit, skip } = parsePagination(req.query, 20);

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
      orderBy: [{ captureDate: 'desc' }, { id: 'desc' }],
      skip,
      take: limit
    });

    const total = await prisma.skinPhoto.count({
      where: { userId: patientId }
    });

    res.json({
      data: await privatePhotos(photos, patientId),
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
        photos: await privatePhotos(photos, patientId),
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
