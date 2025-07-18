import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireDermatologist, requirePatient } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Create prescription (dermatologists only)
router.post('/', requireDermatologist, async (req, res, next) => {
  try {
    const createSchema = z.object({
      patientId: z.string().uuid(),
      medicationName: z.string().min(1),
      dosage: z.string().min(1),
      instructions: z.string().min(1),
      expiryDate: z.string().datetime().optional(),
      refillsRemaining: z.number().min(0).default(0),
      pharmacy: z.string().optional(),
      productId: z.string().uuid().optional()
    });

    const validatedData = createSchema.parse(req.body);

    const prescription = await prisma.prescription.create({
      data: {
        patientId: validatedData.patientId,
        medicationName: validatedData.medicationName,
        dosage: validatedData.dosage,
        instructions: validatedData.instructions,
        expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : undefined,
        refillsRemaining: validatedData.refillsRemaining || 0,
        pharmacy: validatedData.pharmacy,
        productId: validatedData.productId,
        dermatologistId: req.user!.id
      },
      include: {
        patient: {
          select: { id: true, name: true, email: true }
        },
        prescribedBy: {
          select: { id: true, name: true, title: true }
        },
        relatedProduct: {
          select: { id: true, name: true, brand: true }
        }
      }
    });

    res.status(201).json({
      message: 'Prescription created successfully',
      prescription
    });

  } catch (error) {
    next(error);
  }
});

// Get prescriptions
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status as string;

    let whereClause: any = {};

    if (req.user!.userType === 'patient') {
      whereClause.patientId = req.user!.id;
    } else {
      whereClause.dermatologistId = req.user!.id;
    }

    if (status === 'active') {
      whereClause.isActive = true;
      whereClause.expiryDate = { gte: new Date() };
    } else if (status === 'expired') {
      whereClause.OR = [
        { isActive: false },
        { expiryDate: { lt: new Date() } }
      ];
    }

    const prescriptions = await prisma.prescription.findMany({
      where: whereClause,
      include: {
        patient: {
          select: { id: true, name: true, email: true }
        },
        prescribedBy: {
          select: { id: true, name: true, title: true }
        },
        relatedProduct: {
          select: { id: true, name: true, brand: true, imageUrl: true }
        }
      },
      orderBy: { prescribedDate: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.prescription.count({ where: whereClause });

    res.json({
      prescriptions,
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

// Update prescription
router.patch('/:id', requireDermatologist, async (req, res, next) => {
  try {
    const updateSchema = z.object({
      dosage: z.string().optional(),
      instructions: z.string().optional(),
      expiryDate: z.string().datetime().optional(),
      refillsRemaining: z.number().min(0).optional(),
      isActive: z.boolean().optional(),
      pharmacy: z.string().optional()
    });

    const validatedData = updateSchema.parse(req.body);
    const { id } = req.params;

    const prescription = await prisma.prescription.update({
      where: { 
        id,
        dermatologistId: req.user!.id  // Ensure dermatologist owns this prescription
      },
      data: {
        ...validatedData,
        expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : undefined
      },
      include: {
        patient: {
          select: { id: true, name: true, email: true }
        },
        prescribedBy: {
          select: { id: true, name: true, title: true }
        }
      }
    });

    res.json({
      message: 'Prescription updated successfully',
      prescription
    });

  } catch (error) {
    next(error);
  }
});

export default router;