import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requirePatient } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const createRoutineSchema = z.object({
  name: z.string().min(1),
  timeOfDay: z.enum(['morning', 'evening']),
  steps: z.array(z.object({
    productName: z.string().min(1),
    productType: z.string().optional(),
    instructions: z.string().optional(),
    duration: z.number().min(0).default(0),
    orderIndex: z.number().min(0)
  }))
});

const updateRoutineSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  completedToday: z.boolean().optional()
});

// Create routine
router.post('/', requirePatient, async (req, res, next) => {
  try {
    const validatedData = createRoutineSchema.parse(req.body);
    const { name, timeOfDay, steps } = validatedData;

    const routine = await prisma.routine.create({
      data: {
        name,
        timeOfDay,
        userId: req.user!.id,
        steps: {
          create: steps.map(step => ({
            productName: step.productName,
            productType: step.productType,
            instructions: step.instructions,
            duration: step.duration,
            orderIndex: step.orderIndex
          }))
        }
      },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    res.status(201).json({
      message: 'Routine created successfully',
      routine
    });

  } catch (error) {
    next(error);
  }
});

// Get user's routines
router.get('/', requirePatient, async (req, res, next) => {
  try {
    const timeOfDay = req.query.timeOfDay as string;
    const activeOnly = req.query.activeOnly === 'true';

    let whereClause: any = {
      userId: req.user!.id
    };

    if (timeOfDay) {
      whereClause.timeOfDay = timeOfDay;
    }

    if (activeOnly) {
      whereClause.isActive = true;
    }

    const routines = await prisma.routine.findMany({
      where: whereClause,
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: [
        { timeOfDay: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    res.json({ routines });

  } catch (error) {
    next(error);
  }
});

// Get specific routine
router.get('/:id', requirePatient, async (req, res, next) => {
  try {
    const { id } = req.params;

    const routine = await prisma.routine.findUnique({
      where: { 
        id,
        userId: req.user!.id
      },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!routine) {
      return res.status(404).json({
        error: 'Routine not found',
        code: 'ROUTINE_NOT_FOUND'
      });
    }

    res.json({ routine });

  } catch (error) {
    next(error);
  }
});

// Update routine
router.patch('/:id', requirePatient, async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateRoutineSchema.parse(req.body);

    const routine = await prisma.routine.update({
      where: { 
        id,
        userId: req.user!.id
      },
      data: validatedData,
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    res.json({
      message: 'Routine updated successfully',
      routine
    });

  } catch (error) {
    next(error);
  }
});

// Delete routine
router.delete('/:id', requirePatient, async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.routine.delete({
      where: { 
        id,
        userId: req.user!.id
      }
    });

    res.json({
      message: 'Routine deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Mark routine step as completed
router.post('/:routineId/steps/:stepId/complete', requirePatient, async (req, res, next) => {
  try {
    const { routineId, stepId } = req.params;

    // Verify routine belongs to user
    const routine = await prisma.routine.findUnique({
      where: { 
        id: routineId,
        userId: req.user!.id
      }
    });

    if (!routine) {
      return res.status(404).json({
        error: 'Routine not found',
        code: 'ROUTINE_NOT_FOUND'
      });
    }

    // Update step completion
    const step = await prisma.routineStep.update({
      where: { 
        id: stepId,
        routineId
      },
      data: { isCompleted: true }
    });

    // Check if all steps are completed
    const allSteps = await prisma.routineStep.findMany({
      where: { routineId },
      select: { isCompleted: true }
    });

    const allCompleted = allSteps.every(step => step.isCompleted);

    // If all steps completed, mark routine as completed today
    if (allCompleted) {
      await prisma.routine.update({
        where: { id: routineId },
        data: { completedToday: true }
      });
    }

    res.json({
      message: 'Step marked as completed',
      step,
      routineCompleted: allCompleted
    });

  } catch (error) {
    next(error);
  }
});

// Reset daily completion (should be called daily)
router.post('/reset-daily', requirePatient, async (req, res, next) => {
  try {
    // Reset all routine and step completions for the user
    await prisma.routine.updateMany({
      where: { userId: req.user!.id },
      data: { completedToday: false }
    });

    // Reset all steps for user's routines
    const userRoutines = await prisma.routine.findMany({
      where: { userId: req.user!.id },
      select: { id: true }
    });

    const routineIds = userRoutines.map(r => r.id);

    await prisma.routineStep.updateMany({
      where: { routineId: { in: routineIds } },
      data: { isCompleted: false }
    });

    res.json({
      message: 'Daily routine progress reset successfully'
    });

  } catch (error) {
    next(error);
  }
});

export default router;