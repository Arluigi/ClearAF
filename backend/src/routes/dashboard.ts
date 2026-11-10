import express from 'express';
import { prisma } from '../config/database';

const router = express.Router();


// Get dashboard statistics for dermatologist
router.get('/stats', async (req, res) => {
  try {
    const user = req.user;

    if (!user || user.userType !== 'dermatologist') {
      return res.status(403).json({ error: 'Access denied. Dermatologists only.' });
    }

    // Get total patients assigned to this dermatologist
    const totalPatients = await prisma.user.count({
      where: {
        dermatologistId: user.id
      }
    });

    // Get today's appointments
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const appointmentsToday = await prisma.appointment.count({
      where: {
        dermatologistId: user.id,
        patient: { dermatologistId: user.id },
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: {
          in: ['scheduled', 'in-progress']
        }
      }
    });

    const assignedPatients = await prisma.user.findMany({ where: { dermatologistId: user.id }, select: { id: true } });
    // Get unread messages count
    const unreadMessages = await prisma.message.count({
      where: {
        recipientId: user.id,
        recipientType: 'dermatologist',
        senderType: 'patient',
        senderId: { in: assignedPatients.map(patient => patient.id) },
        isRead: false
      }
    });

    // Legacy numeric keys remain for installed clients. Launch records never
    // participate in legacy score-derived displays or change stored chart data.
    const launchPatients=await prisma.launchCase.findMany({where:{patientId:{in:assignedPatients.map(patient=>patient.id)}},select:{patientId:true}});
    const launchPatientIds=launchPatients.map(patient=>patient.patientId);
    // Historical legacy calculation only.
    const patientsWithScores = await prisma.user.findMany({
      where: {
        dermatologistId: user.id,
        id: {notIn:launchPatientIds},
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

    // Get recent patients (last 5 patients with recent activity)
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

    // Get upcoming appointments for today
    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        dermatologistId: user.id,
        patient: { dermatologistId: user.id },
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
            name: true
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
      recentPatients:recentPatients.map(patient=>launchPatientIds.includes(patient.id)?{...patient,currentSkinScore:0,streakCount:0}:patient),
      upcomingAppointments
    };

    res.json(dashboardStats);
  } catch (error) {
    console.error('Operation failed');
    res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
});

export default router;
