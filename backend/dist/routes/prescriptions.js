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
router.post('/', auth_1.requireDermatologist, async (req, res, next) => {
    try {
        const createSchema = zod_1.z.object({
            patientId: zod_1.z.string().uuid(),
            medicationName: zod_1.z.string().min(1),
            dosage: zod_1.z.string().min(1),
            instructions: zod_1.z.string().min(1),
            expiryDate: zod_1.z.string().datetime().optional(),
            refillsRemaining: zod_1.z.number().min(0).default(0),
            pharmacy: zod_1.z.string().optional(),
            productId: zod_1.z.string().uuid().optional()
        });
        const validatedData = createSchema.parse(req.body);
        const prescription = await prisma.prescription.create({
            data: {
                ...validatedData,
                expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : undefined,
                dermatologistId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const status = req.query.status;
        let whereClause = {};
        if (req.user.userType === 'patient') {
            whereClause.patientId = req.user.id;
        }
        else {
            whereClause.dermatologistId = req.user.id;
        }
        if (status === 'active') {
            whereClause.isActive = true;
            whereClause.expiryDate = { gte: new Date() };
        }
        else if (status === 'expired') {
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
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id', auth_1.requireDermatologist, async (req, res, next) => {
    try {
        const updateSchema = zod_1.z.object({
            dosage: zod_1.z.string().optional(),
            instructions: zod_1.z.string().optional(),
            expiryDate: zod_1.z.string().datetime().optional(),
            refillsRemaining: zod_1.z.number().min(0).optional(),
            isActive: zod_1.z.boolean().optional(),
            pharmacy: zod_1.z.string().optional()
        });
        const validatedData = updateSchema.parse(req.body);
        const { id } = req.params;
        const prescription = await prisma.prescription.update({
            where: {
                id,
                dermatologistId: req.user.id
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
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=prescriptions.js.map