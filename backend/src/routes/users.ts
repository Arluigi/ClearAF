import express from 'express';
import { privatePhotos } from '../services/photoAccess';
import { z } from 'zod';
import { prisma } from '../config/database';

const router = express.Router();


// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  skinType: z.enum(["Normal", "Dry", "Oily", "Combination", "Sensitive"]).optional(),
  skinConcerns: z.string().optional(),
  allergies: z.string().optional(),
  currentMedications: z.string().optional(),
  onboardingCompleted: z.boolean().optional()
}).strict().superRefine((value, context) => {
  if (value.onboardingCompleted === true && (!value.name || !value.skinType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Name and skin type are required to finish onboarding' });
  }
});

const updateSkinScoreSchema = z.object({
  skinScore: z.number().min(0).max(100),
  photoId: z.string().uuid().optional()
});

// Get current user profile
router.get('/profile', async (req, res, next) => {
  try {
    let user;

    if (req.user!.userType === 'patient') {
      user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          name: true,
          skinType: true,
          currentSkinScore: true,
          streakCount: true,
          onboardingCompleted: true,
          allergies: true,
          currentMedications: true,
          skinConcerns: true,
          joinDate: true,
          assignedDermatologist: {
            select: {
              id: true,
              name: true,
              title: true,
              specialization: true,
              profileImageUrl: true,
              isAvailable: true
            }
          }
        }
      });
    } else {
      user = await prisma.dermatologist.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          name: true,
          title: true,
          specialization: true,
          profileImageUrl: true,
          phone: true,
          isAvailable: true,
          createdAt: true
        }
      });
    }

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({ user: { ...user, email: req.user!.email, userType: req.user!.userType } });

  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch('/profile', async (req, res, next) => {
  try {
    if (req.user!.userType === 'patient') {
      const validatedData = updateProfileSchema.parse(req.body);
      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: validatedData,
        select: {
          id: true,
          name: true,
          skinType: true,
          currentSkinScore: true,
          streakCount: true,
          onboardingCompleted: true,
          allergies: true,
          currentMedications: true,
          skinConcerns: true,
          joinDate: true,
          updatedAt: true
        }
      });

      res.json({
        message: 'Profile updated successfully',
        user: { ...updatedUser, email: req.user!.email, userType: req.user!.userType }
      });
    } else {
      // Dermatologist profile update
      const dermatologistUpdateSchema = z.object({
        name: z.string().min(2).optional(),
        title: z.string().optional(),
        specialization: z.string().optional(),
        phone: z.string().optional(),
        isAvailable: z.boolean().optional()
      });

      const dermatologistData = dermatologistUpdateSchema.parse(req.body);

      const updatedDermatologist = await prisma.dermatologist.update({
        where: { id: req.user!.id },
        data: dermatologistData,
        select: {
          id: true,
          name: true,
          title: true,
          specialization: true,
          phone: true,
          isAvailable: true,
          updatedAt: true
        }
      });

      res.json({
        message: 'Profile updated successfully',
        user: { ...updatedDermatologist, email: req.user!.email, userType: req.user!.userType }
      });
    }

  } catch (error) {
    next(error);
  }
});

// Update skin score (patients only)
router.post('/skin-score', async (req, res, next) => {
  try {
    if (req.user!.userType !== 'patient') {
      return res.status(403).json({
        error: 'Only patients can update skin score',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const validatedData = updateSkinScoreSchema.parse(req.body);
    const { skinScore, photoId } = validatedData;

    // Update user's current skin score
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        currentSkinScore: skinScore,
        streakCount: {
          increment: 1
        }
      },
      select: {
        id: true,
        currentSkinScore: true,
        streakCount: true
      }
    });

    // If photo ID provided, update the photo's skin score
    if (photoId) {
      await prisma.skinPhoto.update({
        where: {
          id: photoId,
          userId: req.user!.id  // Ensure user owns the photo
        },
        data: {
          skinScore
        }
      });
    }

    res.json({
      message: 'Skin score updated successfully',
      user: { ...updatedUser, email: req.user!.email, userType: req.user!.userType }
    });

  } catch (error) {
    next(error);
  }
});

// Get user statistics
router.get('/stats', async (req, res, next) => {
  try {
    if (req.user!.userType === 'patient') {
      // Patient statistics
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          currentSkinScore: true,
          streakCount: true,
          joinDate: true
        }
      });

      const totalPhotos = await prisma.skinPhoto.count({
        where: { userId: req.user!.id }
      });

      const totalAppointments = await prisma.appointment.count({
        where: { patientId: req.user!.id }
      });

      const recentPhotos = await prisma.skinPhoto.findMany({
        where: { userId: req.user!.id },
        orderBy: { captureDate: 'desc' },
        take: 7,
        select: {
          skinScore: true,
          captureDate: true
        }
      });

      // Calculate score trend
      const scoreHistory = recentPhotos.map(photo => photo.skinScore);
      const averageScore = scoreHistory.length > 0
        ? Math.round(scoreHistory.reduce((a, b) => a + b, 0) / scoreHistory.length)
        : 0;

      res.json({
        stats: {
          currentSkinScore: user?.currentSkinScore || 0,
          averageScore,
          streakCount: user?.streakCount || 0,
          totalPhotos,
          totalAppointments,
          daysSinceJoined: user?.joinDate
            ? Math.floor((Date.now() - user.joinDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
          recentScores: scoreHistory
        }
      });

    } else {
      // Dermatologist statistics
      const totalPatients = await prisma.user.count({
        where: { dermatologistId: req.user!.id }
      });

      const totalAppointments = await prisma.appointment.count({
        where: { dermatologistId: req.user!.id, patient: { dermatologistId: req.user!.id } }
      });

      const upcomingAppointments = await prisma.appointment.count({
        where: {
          dermatologistId: req.user!.id,
          patient: { dermatologistId: req.user!.id },
          scheduledDate: {
            gte: new Date()
          },
          status: {
            in: ['scheduled', 'confirmed']
          }
        }
      });

      const assignedPatients = await prisma.user.findMany({ where: { dermatologistId: req.user!.id }, select: { id: true } });
      const unreadMessages = await prisma.message.count({
        where: {
          recipientId: req.user!.id,
          recipientType: 'dermatologist',
          senderType: 'patient',
          senderId: { in: assignedPatients.map(patient => patient.id) },
          isRead: false
        }
      });

      res.json({
        stats: {
          totalPatients,
          totalAppointments,
          upcomingAppointments,
          unreadMessages
        }
      });
    }

  } catch (error) {
    next(error);
  }
});

// Assignment is a privileged operational action; there is no public admin role.
router.post('/assign-dermatologist', (_req, res) => {
  res.status(403).json({ error: 'Assignment requires practice administration', code: 'ASSIGNMENT_FORBIDDEN' });
});

// Get all patients (dermatologists only) - for patient management
router.get('/', async (req, res, next) => {
  try {
    if (req.user!.userType !== 'dermatologist') {
      return res.status(403).json({
        error: 'Access denied. Dermatologists only.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const userType = req.query.userType as string;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    // Only get patients assigned to this dermatologist
    where.dermatologistId = req.user!.id;

    // Add search functionality
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get patients with pagination
    const [patients, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          skinType: true,
          currentSkinScore: true,
          streakCount: true,
          onboardingCompleted: true,
          allergies: true,
          currentMedications: true,
          skinConcerns: true,
          createdAt: true,
          updatedAt: true,
          dermatologistId: true
        }
      }),
      prisma.user.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: patients,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });

  } catch (error) {
    next(error);
  }
});
// Get all patients for a dermatologist (with photos)
router.get("/patients", async (req, res, next) => {
  try {
    // Only dermatologists can access this endpoint
    if (req.user!.userType !== "dermatologist") {
      return res.status(403).json({
        error: "Only dermatologists can access patient list",
        code: "FORBIDDEN"
      });
    }

    const patients = await prisma.user.findMany({
      where: {
        dermatologistId: req.user!.id
      },
      select: {
        id: true,
        name: true,
        skinType: true,
        currentSkinScore: true,
        streakCount: true,
        joinDate: true,
        createdAt: true,
        allergies: true,
        currentMedications: true,
        skinConcerns: true,
        skinPhotos: {
          orderBy: { captureDate: "desc" },
          take: 10,
          select: {
            id: true,
            photoUrl: true,
            skinScore: true,
            captureDate: true,
            notes: true
          }
        },
        appointments: {
          orderBy: { scheduledDate: "desc" },
          take: 5,
          select: {
            id: true,
            scheduledDate: true,
            type: true,
            status: true,
            concern: true
          }
        },
        prescriptions: {
          where: { isActive: true },
          select: {
            id: true,
            medicationName: true,
            dosage: true,
            prescribedDate: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({
      patients: await Promise.all(patients.map(async patient => ({ ...patient, skinPhotos: await privatePhotos(patient.skinPhotos, patient.id) }))),
      total: patients.length
    });

  } catch (error) {
    next(error);
  }
});


// Get specific patient by ID (dermatologists only)
router.get('/:id', async (req, res, next) => {
  try {
    if (req.user!.userType !== 'dermatologist') {
      return res.status(403).json({
        error: 'Access denied. Dermatologists only.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const patientId = req.params.id;

    const patient = await prisma.user.findFirst({
      where: {
        id: patientId,
        dermatologistId: req.user!.id // Ensure dermatologist can only access their patients
      },
      select: {
        id: true,
        name: true,
        skinType: true,
        currentSkinScore: true,
        streakCount: true,
        onboardingCompleted: true,
        allergies: true,
        currentMedications: true,
        skinConcerns: true,
        createdAt: true,
        updatedAt: true,
        dermatologistId: true
      }
    });

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found or not assigned to you',
        code: 'PATIENT_NOT_FOUND'
      });
    }

    res.json(patient);

  } catch (error) {
    next(error);
  }
});


export default router;
