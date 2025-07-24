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
const sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Message content is required'),
    recipientId: zod_1.z.string().uuid('Invalid recipient ID'),
    messageType: zod_1.z.enum(['text', 'image']).default('text'),
    attachmentUrl: zod_1.z.string().url().optional()
});
router.post('/send', auth_1.requirePatient, async (req, res, next) => {
    try {
        const validatedData = sendMessageSchema.parse(req.body);
        const { content, recipientId, messageType, attachmentUrl } = validatedData;
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
        const message = await prisma.message.create({
            data: {
                content,
                senderId: req.user.id,
                recipientId,
                messageType,
                attachmentUrl,
                attachmentType: messageType === 'image' ? 'image' : null
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                recipient: {
                    select: {
                        id: true,
                        name: true,
                        title: true
                    }
                }
            }
        });
        res.status(201).json({
            message: 'Message sent successfully',
            data: message
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/conversation/:dermatologistId', auth_1.requirePatient, async (req, res, next) => {
    try {
        const { dermatologistId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    {
                        senderId: req.user.id,
                        recipientId: dermatologistId
                    }
                ]
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                recipient: {
                    select: {
                        id: true,
                        name: true,
                        title: true
                    }
                }
            },
            orderBy: {
                sentDate: 'asc'
            },
            skip,
            take: limit
        });
        await prisma.message.updateMany({
            where: {
                senderId: dermatologistId,
                recipientId: req.user.id,
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/conversations', auth_1.requireDermatologist, async (req, res, next) => {
    try {
        const conversations = await prisma.message.groupBy({
            by: ['senderId'],
            where: {
                recipientId: req.user.id
            },
            _max: {
                sentDate: true
            },
            orderBy: {
                _max: {
                    sentDate: 'desc'
                }
            }
        });
        const conversationsWithDetails = await Promise.all(conversations.map(async (conv) => {
            const patient = await prisma.user.findUnique({
                where: { id: conv.senderId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    currentSkinScore: true
                }
            });
            const lastMessage = await prisma.message.findFirst({
                where: {
                    senderId: conv.senderId,
                    recipientId: req.user.id
                },
                orderBy: {
                    sentDate: 'desc'
                },
                select: {
                    content: true,
                    sentDate: true,
                    isRead: true,
                    messageType: true
                }
            });
            const unreadCount = await prisma.message.count({
                where: {
                    senderId: conv.senderId,
                    recipientId: req.user.id,
                    isRead: false
                }
            });
            return {
                patient,
                lastMessage,
                unreadCount
            };
        }));
        res.json({
            conversations: conversationsWithDetails
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/reply', auth_1.requireDermatologist, async (req, res, next) => {
    try {
        const replySchema = zod_1.z.object({
            content: zod_1.z.string().min(1, 'Message content is required'),
            patientId: zod_1.z.string().uuid('Invalid patient ID'),
            messageType: zod_1.z.enum(['text', 'image']).default('text'),
            attachmentUrl: zod_1.z.string().url().optional()
        });
        const validatedData = replySchema.parse(req.body);
        const { content, patientId, messageType, attachmentUrl } = validatedData;
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
        const message = await prisma.message.create({
            data: {
                content,
                senderId: patientId,
                recipientId: req.user.id,
                messageType,
                attachmentUrl,
                attachmentType: messageType === 'image' ? 'image' : null
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                recipient: {
                    select: {
                        id: true,
                        name: true,
                        title: true
                    }
                }
            }
        });
        res.status(201).json({
            message: 'Reply sent successfully',
            data: message
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const receiverId = req.query.receiverId;
        const skip = (page - 1) * limit;
        if (user.userType === 'dermatologist') {
            if (!receiverId) {
                return res.status(400).json({
                    error: 'receiverId is required for dermatologists',
                    code: 'MISSING_RECEIVER_ID'
                });
            }
            const messages = await prisma.message.findMany({
                where: {
                    OR: [
                        {
                            senderId: user.id,
                            recipientId: receiverId
                        },
                        {
                            senderId: receiverId,
                            recipientId: user.id
                        }
                    ]
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    },
                    recipient: {
                        select: {
                            id: true,
                            name: true,
                            title: true
                        }
                    }
                },
                orderBy: {
                    sentDate: 'asc'
                },
                skip,
                take: limit
            });
            await prisma.message.updateMany({
                where: {
                    senderId: receiverId,
                    recipientId: user.id,
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
                            senderId: user.id,
                            recipientId: receiverId
                        },
                        {
                            senderId: receiverId,
                            recipientId: user.id
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
        }
        else {
            return res.status(403).json({
                error: 'Access denied',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=messages.js.map