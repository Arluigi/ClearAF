"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    skinType: zod_1.z.string().optional(),
    skinConcerns: zod_1.z.string().optional(),
    allergies: zod_1.z.string().optional(),
    currentMedications: zod_1.z.string().optional(),
    onboardingCompleted: zod_1.z.boolean().optional()
});
const updateSkinScoreSchema = zod_1.z.object({
    skinScore: zod_1.z.number().min(0).max(100),
    photoId: zod_1.z.string().uuid().optional()
});
router.get('/profile', async (req, res, next) => {
    try {
        let user;
        if (req.user.userType === 'patient') {
            user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
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
        }
        else {
            user = await prisma.dermatologist.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
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
        res.json({ user });
    }
    catch (error) {
        next(error);
    }
});
router.patch('/profile', async (req, res, next) => {
    try {
        const validatedData = updateProfileSchema.parse(req.body);
        if (req.user.userType === 'patient') {
            const updatedUser = await prisma.user.update({
                where: { id: req.user.id },
                data: validatedData,
                select: {
                    id: true,
                    name: true,
                    email: true,
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
                user: updatedUser
            });
        }
        else {
            const dermatologistUpdateSchema = zod_1.z.object({
                name: zod_1.z.string().min(2).optional(),
                title: zod_1.z.string().optional(),
                specialization: zod_1.z.string().optional(),
                phone: zod_1.z.string().optional(),
                isAvailable: zod_1.z.boolean().optional()
            });
            const dermatologistData = dermatologistUpdateSchema.parse(req.body);
            const updatedDermatologist = await prisma.dermatologist.update({
                where: { id: req.user.id },
                data: dermatologistData,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    title: true,
                    specialization: true,
                    phone: true,
                    isAvailable: true,
                    updatedAt: true
                }
            });
            res.json({
                message: 'Profile updated successfully',
                user: updatedDermatologist
            });
        }
    }
    catch (error) {
        next(error);
    }
});
router.post('/skin-score', async (req, res, next) => {
    try {
        if (req.user.userType !== 'patient') {
            return res.status(403).json({
                error: 'Only patients can update skin score',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        const validatedData = updateSkinScoreSchema.parse(req.body);
        const { skinScore, photoId } = validatedData;
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
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
        if (photoId) {
            await prisma.skinPhoto.update({
                where: {
                    id: photoId,
                    userId: req.user.id
                },
                data: {
                    skinScore
                }
            });
        }
        res.json({
            message: 'Skin score updated successfully',
            user: updatedUser
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/stats', async (req, res, next) => {
    try {
        if (req.user.userType === 'patient') {
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    currentSkinScore: true,
                    streakCount: true,
                    joinDate: true
                }
            });
            const totalPhotos = await prisma.skinPhoto.count({
                where: { userId: req.user.id }
            });
            const totalAppointments = await prisma.appointment.count({
                where: { patientId: req.user.id }
            });
            const recentPhotos = await prisma.skinPhoto.findMany({
                where: { userId: req.user.id },
                orderBy: { captureDate: 'desc' },
                take: 7,
                select: {
                    skinScore: true,
                    captureDate: true
                }
            });
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
        }
        else {
            const totalPatients = await prisma.user.count({
                where: { dermatologistId: req.user.id }
            });
            const totalAppointments = await prisma.appointment.count({
                where: { dermatologistId: req.user.id }
            });
            const upcomingAppointments = await prisma.appointment.count({
                where: {
                    dermatologistId: req.user.id,
                    scheduledDate: {
                        gte: new Date()
                    },
                    status: {
                        in: ['scheduled', 'confirmed']
                    }
                }
            });
            const unreadMessages = await prisma.message.count({
                where: {
                    recipientId: req.user.id,
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
    }
    catch (error) {
        next(error);
    }
});
router.post('/assign-dermatologist', async (req, res, next) => {
    try {
        const assignSchema = zod_1.z.object({
            patientId: zod_1.z.string().uuid(),
            dermatologistId: zod_1.z.string().uuid()
        });
        const { patientId, dermatologistId } = assignSchema.parse(req.body);
        const [patient, dermatologist] = await Promise.all([
            prisma.user.findUnique({ where: { id: patientId } }),
            prisma.dermatologist.findUnique({ where: { id: dermatologistId } })
        ]);
        if (!patient || !dermatologist) {
            return res.status(404).json({
                error: 'Patient or dermatologist not found',
                code: 'USER_NOT_FOUND'
            });
        }
        const updatedPatient = await prisma.user.update({
            where: { id: patientId },
            data: { dermatologistId },
            select: {
                id: true,
                name: true,
                email: true,
                assignedDermatologist: {
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
            message: 'Dermatologist assigned successfully',
            patient: updatedPatient
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/', async (req, res, next) => {
    try {
        if (req.user.userType !== 'dermatologist') {
            return res.status(403).json({
                error: 'Access denied. Dermatologists only.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search;
        const userType = req.query.userType;
        const skip = (page - 1) * limit;
        const where = {};
        where.dermatologistId = req.user.id;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [patients, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        if (req.user.userType !== 'dermatologist') {
            return res.status(403).json({
                error: 'Access denied. Dermatologists only.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        const patientId = req.params.id;
        const patient = await prisma.user.findFirst({
            where: {
                id: patientId,
                dermatologistId: req.user.id
            },
            select: {
                id: true,
                name: true,
                email: true,
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
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map