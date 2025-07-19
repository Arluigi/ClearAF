"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
const createRoutineSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    timeOfDay: zod_1.z.enum(['morning', 'evening']),
    steps: zod_1.z.array(zod_1.z.object({
        productName: zod_1.z.string().min(1),
        productType: zod_1.z.string().optional(),
        instructions: zod_1.z.string().optional(),
        duration: zod_1.z.number().min(0).default(0),
        orderIndex: zod_1.z.number().min(0)
    }))
});
const updateRoutineSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    isActive: zod_1.z.boolean().optional(),
    completedToday: zod_1.z.boolean().optional()
});
router.post('/', auth_1.requirePatient, async (req, res, next) => {
    try {
        const validatedData = createRoutineSchema.parse(req.body);
        const { name, timeOfDay, steps } = validatedData;
        const routine = await prisma.routine.create({
            data: {
                name,
                timeOfDay,
                userId: req.user.id,
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/', auth_1.requirePatient, async (req, res, next) => {
    try {
        const timeOfDay = req.query.timeOfDay;
        const activeOnly = req.query.activeOnly === 'true';
        let whereClause = {
            userId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { id } = req.params;
        const routine = await prisma.routine.findUnique({
            where: {
                id,
                userId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { id } = req.params;
        const validatedData = updateRoutineSchema.parse(req.body);
        const routine = await prisma.routine.update({
            where: {
                id,
                userId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.routine.delete({
            where: {
                id,
                userId: req.user.id
            }
        });
        res.json({
            message: 'Routine deleted successfully'
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/:routineId/steps/:stepId/complete', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { routineId, stepId } = req.params;
        const routine = await prisma.routine.findUnique({
            where: {
                id: routineId,
                userId: req.user.id
            }
        });
        if (!routine) {
            return res.status(404).json({
                error: 'Routine not found',
                code: 'ROUTINE_NOT_FOUND'
            });
        }
        const step = await prisma.routineStep.update({
            where: {
                id: stepId,
                routineId
            },
            data: { isCompleted: true }
        });
        const allSteps = await prisma.routineStep.findMany({
            where: { routineId },
            select: { isCompleted: true }
        });
        const allCompleted = allSteps.every(step => step.isCompleted);
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
    }
    catch (error) {
        next(error);
    }
});
router.post('/reset-daily', auth_1.requirePatient, async (req, res, next) => {
    try {
        await prisma.routine.updateMany({
            where: { userId: req.user.id },
            data: { completedToday: false }
        });
        const userRoutines = await prisma.routine.findMany({
            where: { userId: req.user.id },
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
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=routines.js.map