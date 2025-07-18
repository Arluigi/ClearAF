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
const uploadPhotoSchema = zod_1.z.object({
    photoUrl: zod_1.z.string().url('Invalid photo URL'),
    skinScore: zod_1.z.number().min(0).max(100).optional(),
    notes: zod_1.z.string().optional(),
    appointmentId: zod_1.z.string().uuid().optional()
});
const updatePhotoSchema = zod_1.z.object({
    skinScore: zod_1.z.number().min(0).max(100).optional(),
    notes: zod_1.z.string().optional()
});
router.post('/', auth_1.requirePatient, async (req, res, next) => {
    try {
        const validatedData = uploadPhotoSchema.parse(req.body);
        const { photoUrl, skinScore, notes, appointmentId } = validatedData;
        if (appointmentId) {
            const appointment = await prisma.appointment.findUnique({
                where: {
                    id: appointmentId,
                    patientId: req.user.id
                }
            });
            if (!appointment) {
                return res.status(404).json({
                    error: 'Appointment not found or access denied',
                    code: 'APPOINTMENT_NOT_FOUND'
                });
            }
        }
        const photo = await prisma.skinPhoto.create({
            data: {
                photoUrl,
                skinScore: skinScore || 0,
                notes,
                userId: req.user.id,
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
        if (skinScore !== undefined) {
            await prisma.user.update({
                where: { id: req.user.id },
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/', auth_1.requirePatient, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const sortBy = req.query.sortBy || 'captureDate';
        const order = req.query.order || 'desc';
        const validSortFields = ['captureDate', 'skinScore'];
        const validOrder = ['asc', 'desc'];
        if (!validSortFields.includes(sortBy) || !validOrder.includes(order)) {
            return res.status(400).json({
                error: 'Invalid sort parameters',
                code: 'INVALID_SORT'
            });
        }
        const photos = await prisma.skinPhoto.findMany({
            where: { userId: req.user.id },
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
            where: { userId: req.user.id }
        });
        const recentPhotos = await prisma.skinPhoto.findMany({
            where: { userId: req.user.id },
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { id } = req.params;
        const photo = await prisma.skinPhoto.findUnique({
            where: {
                id,
                userId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { id } = req.params;
        const validatedData = updatePhotoSchema.parse(req.body);
        const existingPhoto = await prisma.skinPhoto.findUnique({
            where: {
                id,
                userId: req.user.id
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
        if (validatedData.skinScore !== undefined) {
            await prisma.user.update({
                where: { id: req.user.id },
                data: {
                    currentSkinScore: validatedData.skinScore
                }
            });
        }
        res.json({
            message: 'Photo updated successfully',
            photo: updatedPhoto
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { id } = req.params;
        const photo = await prisma.skinPhoto.findUnique({
            where: {
                id,
                userId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/timeline/progress', auth_1.requirePatient, async (req, res, next) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const photos = await prisma.skinPhoto.findMany({
            where: {
                userId: req.user.id,
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
        const weeklyData = photos.reduce((acc, photo) => {
            const week = Math.floor((Date.now() - photo.captureDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
            if (!acc[week]) {
                acc[week] = [];
            }
            acc[week].push(photo);
            return acc;
        }, {});
        const scores = photos.map(p => p.skinScore);
        const averageScore = scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : 0;
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
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=photos.js.map