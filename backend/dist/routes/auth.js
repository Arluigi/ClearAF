"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    userType: zod_1.z.enum(['patient', 'dermatologist']),
    skinType: zod_1.z.string().optional(),
    skinConcerns: zod_1.z.string().optional()
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
    userType: zod_1.z.enum(['patient', 'dermatologist'])
});
const generateToken = (userId, userType, email) => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('JWT_SECRET not configured');
    }
    return jsonwebtoken_1.default.sign({ userId, userType, email }, jwtSecret, { expiresIn: '7d' });
};
router.post('/register', async (req, res, next) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        const { name, email, password, userType, skinType, skinConcerns } = validatedData;
        const saltRounds = 12;
        const hashedPassword = await bcryptjs_1.default.hash(password, saltRounds);
        let user;
        if (userType === 'patient') {
            const defaultDermatologist = await prisma.dermatologist.findFirst({
                where: { isAvailable: true },
                orderBy: { createdAt: 'asc' }
            });
            user = await prisma.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    skinType,
                    skinConcerns,
                    onboardingCompleted: false,
                    dermatologistId: defaultDermatologist?.id
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    skinType: true,
                    onboardingCompleted: true,
                    createdAt: true,
                    dermatologistId: true,
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
        }
        else {
            user = await prisma.dermatologist.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    title: 'Dr.',
                    specialization: 'Dermatology',
                    isAvailable: true
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    title: true,
                    specialization: true,
                    isAvailable: true,
                    createdAt: true
                }
            });
            if (user.dermatologistId) {
                console.log(`✅ New patient ${user.name} auto-assigned to dermatologist ${user.assignedDermatologist?.name}`);
            }
            else {
                console.log(`⚠️  New patient ${user.name} registered but no dermatologist available for assignment`);
            }
        }
        const token = generateToken(user.id, userType, email);
        res.status(201).json({
            message: 'User registered successfully',
            user,
            token,
            userType
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/login', async (req, res, next) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const { email, password, userType } = validatedData;
        let user;
        if (userType === 'patient') {
            user = await prisma.user.findUnique({
                where: { email },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    password: true,
                    skinType: true,
                    currentSkinScore: true,
                    streakCount: true,
                    onboardingCompleted: true,
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
        }
        else {
            user = await prisma.dermatologist.findUnique({
                where: { email },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    password: true,
                    title: true,
                    specialization: true,
                    isAvailable: true,
                    patients: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            currentSkinScore: true
                        }
                    }
                }
            });
        }
        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        const { password: _, ...userWithoutPassword } = user;
        const token = generateToken(user.id, userType, email);
        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token,
            userType
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/me', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                code: 'NO_TOKEN'
            });
        }
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT_SECRET not configured');
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        let user;
        if (decoded.userType === 'patient') {
            user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    skinType: true,
                    currentSkinScore: true,
                    streakCount: true,
                    onboardingCompleted: true,
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
        }
        else {
            user = await prisma.dermatologist.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    title: true,
                    specialization: true,
                    isAvailable: true
                }
            });
        }
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        res.json({
            user,
            userType: decoded.userType
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map