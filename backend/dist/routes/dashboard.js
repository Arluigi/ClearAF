"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
router.get('/stats', async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.userType !== 'dermatologist') {
            return res.status(403).json({ error: 'Access denied. Dermatologists only.' });
        }
        const totalPatients = await prisma.user.count({
            where: {
                dermatologistId: user.id
            }
        });
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        const appointmentsToday = await prisma.appointment.count({
            where: {
                dermatologistId: user.id,
                scheduledDate: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                status: {
                    in: ['scheduled', 'in-progress']
                }
            }
        });
        const unreadMessages = await prisma.message.count({
            where: {
                recipientId: user.id,
                isRead: false
            }
        });
        const patientsWithScores = await prisma.user.findMany({
            where: {
                dermatologistId: user.id,
                currentSkinScore: {
                    gt: 0
                }
            },
            select: {
                currentSkinScore: true
            }
        });
        const avgImprovement = patientsWithScores.length > 0
            ? Math.round(patientsWithScores.reduce((sum, patient) => sum + (patient.currentSkinScore || 0), 0) / patientsWithScores.length)
            : 0;
        const recentPatients = await prisma.user.findMany({
            where: {
                dermatologistId: user.id
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 5,
            select: {
                id: true,
                name: true,
                email: true,
                skinType: true,
                currentSkinScore: true,
                updatedAt: true,
                createdAt: true,
                onboardingCompleted: true,
                allergies: true,
                currentMedications: true,
                skinConcerns: true,
                streakCount: true,
                dermatologistId: true
            }
        });
        const upcomingAppointments = await prisma.appointment.findMany({
            where: {
                dermatologistId: user.id,
                scheduledDate: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                status: {
                    in: ['scheduled', 'in-progress']
                }
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                scheduledDate: 'asc'
            }
        });
        const dashboardStats = {
            totalPatients,
            appointmentsToday,
            unreadMessages,
            avgImprovement,
            recentPatients,
            upcomingAppointments
        };
        res.json(dashboardStats);
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to load dashboard statistics' });
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.js.map