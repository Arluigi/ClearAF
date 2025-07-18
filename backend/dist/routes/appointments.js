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
const createAppointmentSchema = zod_1.z.object({
    scheduledDate: zod_1.z.string().datetime('Invalid date format'),
    type: zod_1.z.enum(['consultation', 'follow-up', 'treatment', 'emergency']),
    concern: zod_1.z.string().min(10, 'Please describe your concern in at least 10 characters'),
    duration: zod_1.z.number().min(15).max(120).default(30),
    dermatologistId: zod_1.z.string().uuid('Invalid dermatologist ID').optional()
});
const updateAppointmentSchema = zod_1.z.object({
    scheduledDate: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled']).optional(),
    visitNotes: zod_1.z.string().optional(),
    videoCallURL: zod_1.z.string().url().optional()
});
router.post('/', auth_1.requirePatient, async (req, res, next) => {
    try {
        const validatedData = createAppointmentSchema.parse(req.body);
        const { scheduledDate, type, concern, duration, dermatologistId } = validatedData;
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                assignedDermatologist: {
                    select: { id: true, name: true, title: true }
                }
            }
        });
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        const targetDermatologistId = dermatologistId || user.assignedDermatologist?.id;
        if (!targetDermatologistId) {
            return res.status(400).json({
                error: 'No dermatologist assigned. Please contact support.',
                code: 'NO_DERMATOLOGIST'
            });
        }
        const dermatologist = await prisma.dermatologist.findUnique({
            where: { id: targetDermatologistId },
            select: { id: true, name: true, title: true, isAvailable: true }
        });
        if (!dermatologist || !dermatologist.isAvailable) {
            return res.status(400).json({
                error: 'Dermatologist is not available',
                code: 'DERMATOLOGIST_UNAVAILABLE'
            });
        }
        const appointmentDate = new Date(scheduledDate);
        const conflictingAppointment = await prisma.appointment.findFirst({
            where: {
                dermatologistId: targetDermatologistId,
                scheduledDate: {
                    gte: new Date(appointmentDate.getTime() - 30 * 60 * 1000),
                    lte: new Date(appointmentDate.getTime() + 30 * 60 * 1000)
                },
                status: {
                    in: ['scheduled', 'confirmed', 'in-progress']
                }
            }
        });
        if (conflictingAppointment) {
            return res.status(409).json({
                error: 'Time slot not available. Please choose a different time.',
                code: 'TIME_CONFLICT'
            });
        }
        const appointment = await prisma.appointment.create({
            data: {
                scheduledDate: appointmentDate,
                type,
                concern,
                duration,
                status: 'scheduled',
                patientId: req.user.id,
                dermatologistId: targetDermatologistId
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        skinType: true,
                        currentSkinScore: true
                    }
                },
                dermatologist: {
                    select: {
                        id: true,
                        name: true,
                        title: true,
                        specialization: true
                    }
                }
            }
        });
        res.status(201).json({
            message: 'Appointment booked successfully',
            appointment
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const status = req.query.status;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        let whereClause = {};
        if (req.user.userType === 'patient') {
            whereClause.patientId = req.user.id;
        }
        else {
            whereClause.dermatologistId = req.user.id;
        }
        if (status) {
            whereClause.status = status;
        }
        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                patient: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        skinType: true,
                        currentSkinScore: true
                    }
                },
                dermatologist: {
                    select: {
                        id: true,
                        name: true,
                        title: true,
                        specialization: true
                    }
                },
                relatedPhotos: {
                    select: {
                        id: true,
                        photoUrl: true,
                        skinScore: true,
                        captureDate: true
                    }
                }
            },
            orderBy: {
                scheduledDate: 'desc'
            },
            skip,
            take: limit
        });
        const total = await prisma.appointment.count({
            where: whereClause
        });
        res.json({
            appointments,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const appointment = await prisma.appointment.findUnique({
            where: { id },
            include: {
                patient: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        skinType: true,
                        currentSkinScore: true,
                        allergies: true,
                        currentMedications: true,
                        skinConcerns: true
                    }
                },
                dermatologist: {
                    select: {
                        id: true,
                        name: true,
                        title: true,
                        specialization: true,
                        email: true,
                        phone: true
                    }
                },
                relatedPhotos: {
                    select: {
                        id: true,
                        photoUrl: true,
                        skinScore: true,
                        notes: true,
                        captureDate: true
                    },
                    orderBy: {
                        captureDate: 'desc'
                    }
                }
            }
        });
        if (!appointment) {
            return res.status(404).json({
                error: 'Appointment not found',
                code: 'APPOINTMENT_NOT_FOUND'
            });
        }
        const hasAccess = ((req.user.userType === 'patient' && appointment.patientId === req.user.id) ||
            (req.user.userType === 'dermatologist' && appointment.dermatologistId === req.user.id));
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        res.json({ appointment });
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const validatedData = updateAppointmentSchema.parse(req.body);
        const existingAppointment = await prisma.appointment.findUnique({
            where: { id },
            select: {
                id: true,
                patientId: true,
                dermatologistId: true,
                status: true
            }
        });
        if (!existingAppointment) {
            return res.status(404).json({
                error: 'Appointment not found',
                code: 'APPOINTMENT_NOT_FOUND'
            });
        }
        const hasAccess = ((req.user.userType === 'patient' && existingAppointment.patientId === req.user.id) ||
            (req.user.userType === 'dermatologist' && existingAppointment.dermatologistId === req.user.id));
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        let updateData = {};
        if (req.user.userType === 'patient') {
            if (validatedData.scheduledDate) {
                updateData.scheduledDate = new Date(validatedData.scheduledDate);
            }
        }
        else {
            if (validatedData.scheduledDate) {
                updateData.scheduledDate = new Date(validatedData.scheduledDate);
            }
            if (validatedData.status) {
                updateData.status = validatedData.status;
            }
            if (validatedData.visitNotes) {
                updateData.visitNotes = validatedData.visitNotes;
            }
            if (validatedData.videoCallURL) {
                updateData.videoCallURL = validatedData.videoCallURL;
            }
        }
        const updatedAppointment = await prisma.appointment.update({
            where: { id },
            data: updateData,
            include: {
                patient: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        skinType: true
                    }
                },
                dermatologist: {
                    select: {
                        id: true,
                        name: true,
                        title: true,
                        specialization: true
                    }
                }
            }
        });
        res.json({
            message: 'Appointment updated successfully',
            appointment: updatedAppointment
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const appointment = await prisma.appointment.findUnique({
            where: { id },
            select: {
                id: true,
                patientId: true,
                dermatologistId: true,
                status: true,
                scheduledDate: true
            }
        });
        if (!appointment) {
            return res.status(404).json({
                error: 'Appointment not found',
                code: 'APPOINTMENT_NOT_FOUND'
            });
        }
        const hasAccess = ((req.user.userType === 'patient' && appointment.patientId === req.user.id) ||
            (req.user.userType === 'dermatologist' && appointment.dermatologistId === req.user.id));
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        if (appointment.status === 'completed') {
            return res.status(400).json({
                error: 'Cannot cancel completed appointment',
                code: 'CANNOT_CANCEL_COMPLETED'
            });
        }
        await prisma.appointment.update({
            where: { id },
            data: { status: 'cancelled' }
        });
        res.json({
            message: 'Appointment cancelled successfully'
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=appointments.js.map