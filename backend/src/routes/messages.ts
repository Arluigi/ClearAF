import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requirePatient, requireDermatologist } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  recipientId: z.string().uuid('Invalid recipient ID'),
  messageType: z.enum(['text', 'image']).default('text'),
  attachmentUrl: z.string().url().optional()
});

// Send message (patients to dermatologists)
router.post('/send', requirePatient, async (req, res, next) => {
  try {
    const validatedData = sendMessageSchema.parse(req.body);
    const { content, recipientId, messageType, attachmentUrl } = validatedData;

    // Verify recipient is a dermatologist
    const dermatologist = await prisma.dermatologist.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true }
    });

    if (!dermatologist) {
      return res.status(404).json({
        error: 'Dermatologist not found',
        code: 'RECIPIENT_NOT_FOUND'
      });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content,
        senderId: req.user!.id,
        senderType: 'patient',
        recipientId,
        recipientType: 'dermatologist',
        messageType,
        attachmentUrl,
        attachmentType: messageType === 'image' ? 'image' : null
      }
    });

    res.status(201).json({
      message: 'Message sent successfully',
      data: message
    });

  } catch (error) {
    next(error);
  }
});

// Get conversation between patient and dermatologist
router.get('/conversation/:dermatologistId', requirePatient, async (req, res, next) => {
  try {
    const { dermatologistId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    // Get messages between current user and dermatologist
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          {
            senderId: req.user!.id,
            senderType: 'patient',
            recipientId: dermatologistId,
            recipientType: 'dermatologist'
          },
          {
            senderId: dermatologistId,
            senderType: 'dermatologist',
            recipientId: req.user!.id,
            recipientType: 'patient'
          }
        ]
      },
      orderBy: {
        sentDate: 'asc'
      },
      skip,
      take: limit
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        senderId: dermatologistId,
        senderType: 'dermatologist',
        recipientId: req.user!.id,
        recipientType: 'patient',
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total: messages.length
      }
    });

  } catch (error) {
    next(error);
  }
});

// Get all conversations for dermatologist
router.get('/conversations', requireDermatologist, async (req, res, next) => {
  try {
    // Get all unique patient IDs who have communicated with this dermatologist
    const messageData = await prisma.message.findMany({
      where: {
        OR: [
          {
            recipientId: req.user!.id,
            recipientType: 'dermatologist'
          },
          {
            senderId: req.user!.id,
            senderType: 'dermatologist'
          }
        ]
      },
      select: {
        senderId: true,
        senderType: true,
        recipientId: true,
        recipientType: true,
        sentDate: true
      },
      orderBy: {
        sentDate: 'desc'
      }
    });

    // Extract unique patient IDs
    const patientIds = new Set<string>();
    messageData.forEach(msg => {
      if (msg.senderType === 'patient') {
        patientIds.add(msg.senderId);
      }
      if (msg.recipientType === 'patient') {
        patientIds.add(msg.recipientId);
      }
    });

    // Get patient details and last message for each conversation
    const conversationsWithDetails = await Promise.all(
      Array.from(patientIds).map(async (patientId) => {
        const patient = await prisma.user.findUnique({
          where: { id: patientId },
          select: {
            id: true,
            name: true,
            currentSkinScore: true,
            skinType: true
          }
        });

        const lastMessage = await prisma.message.findFirst({
          where: {
            OR: [
              {
                senderId: patientId,
                senderType: 'patient',
                recipientId: req.user!.id,
                recipientType: 'dermatologist'
              },
              {
                senderId: req.user!.id,
                senderType: 'dermatologist',
                recipientId: patientId,
                recipientType: 'patient'
              }
            ]
          },
          orderBy: {
            sentDate: 'desc'
          },
          select: {
            content: true,
            sentDate: true,
            isRead: true,
            messageType: true,
            senderId: true,
            senderType: true
          }
        });

        const unreadCount = await prisma.message.count({
          where: {
            senderId: patientId,
            senderType: 'patient',
            recipientId: req.user!.id,
            recipientType: 'dermatologist',
            isRead: false
          }
        });

        return {
          patient,
          lastMessage,
          unreadCount
        };
      })
    );

    // Filter out conversations where patient was not found
    const validConversations = conversationsWithDetails.filter(conv => conv.patient);

    // Sort by last message date
    validConversations.sort((a, b) => {
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return new Date(b.lastMessage.sentDate).getTime() - new Date(a.lastMessage.sentDate).getTime();
    });

    res.json({
      conversations: validConversations
    });

  } catch (error) {
    next(error);
  }
});

// Reply to patient (dermatologists only)
router.post('/reply', requireDermatologist, async (req, res, next) => {
  try {
    const replySchema = z.object({
      content: z.string().min(1, 'Message content is required'),
      patientId: z.string().uuid('Invalid patient ID'),
      messageType: z.enum(['text', 'image']).default('text'),
      attachmentUrl: z.string().url().optional()
    });

    const validatedData = replySchema.parse(req.body);
    const { content, patientId, messageType, attachmentUrl } = validatedData;

    // Verify patient exists
    const patient = await prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true, name: true }
    });

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found',
        code: 'PATIENT_NOT_FOUND'
      });
    }

    // Create reply message
    const message = await prisma.message.create({
      data: {
        content,
        senderId: req.user!.id, // Dermatologist is sending the reply
        senderType: 'dermatologist',
        recipientId: patientId, // Patient is receiving the reply
        recipientType: 'patient',
        messageType,
        attachmentUrl,
        attachmentType: messageType === 'image' ? 'image' : null
      }
    });

    res.status(201).json(message);

  } catch (error) {
    next(error);
  }
});

// Get messages (for dermatologist to see conversation with patient)
router.get('/', requireDermatologist, async (req, res, next) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const receiverId = req.query.receiverId as string;

    const skip = (page - 1) * limit;

    if (user!.userType === 'dermatologist') {
      // Dermatologist getting messages with a specific patient
      if (!receiverId) {
        return res.status(400).json({
          error: 'receiverId is required for dermatologists',
          code: 'MISSING_RECEIVER_ID'
        });
      }

      // Get messages between dermatologist and patient
      const messages = await prisma.message.findMany({
        where: {
          OR: [
            {
              senderId: user!.id,
              senderType: 'dermatologist',
              recipientId: receiverId,
              recipientType: 'patient'
            },
            {
              senderId: receiverId,
              senderType: 'patient', 
              recipientId: user!.id,
              recipientType: 'dermatologist'
            }
          ]
        },
        orderBy: {
          sentDate: 'asc'
        },
        skip,
        take: limit
      });

      // Mark unread messages from patient as read
      await prisma.message.updateMany({
        where: {
          senderId: receiverId,
          senderType: 'patient',
          recipientId: user!.id,
          recipientType: 'dermatologist',
          isRead: false
        },
        data: {
          isRead: true
        }
      });

      const total = await prisma.message.count({
        where: {
          OR: [
            {
              senderId: user!.id,
              senderType: 'dermatologist',
              recipientId: receiverId,
              recipientType: 'patient'
            },
            {
              senderId: receiverId,
              senderType: 'patient',
              recipientId: user!.id,
              recipientType: 'dermatologist'
            }
          ]
        }
      });

      res.json({
        data: messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });

    } else {
      // Patient getting their messages (existing logic could go here)
      return res.status(403).json({
        error: 'Access denied',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

  } catch (error) {
    next(error);
  }
});

export default router;