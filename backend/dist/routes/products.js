"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
router.get('/', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const category = req.query.category;
        const search = req.query.search;
        const prescriptionRequired = req.query.prescriptionRequired;
        let whereClause = {
            isAvailable: true
        };
        if (category) {
            whereClause.category = category;
        }
        if (search) {
            whereClause.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
                { productDescription: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (prescriptionRequired === 'true') {
            whereClause.isPrescriptionRequired = true;
        }
        else if (prescriptionRequired === 'false') {
            whereClause.isPrescriptionRequired = false;
        }
        const products = await prisma.product.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                brand: true,
                category: true,
                price: true,
                productDescription: true,
                imageUrl: true,
                isPrescriptionRequired: true
            },
            orderBy: [
                { category: 'asc' },
                { name: 'asc' }
            ],
            skip,
            take: limit
        });
        const total = await prisma.product.count({ where: whereClause });
        const categories = await prisma.product.groupBy({
            by: ['category'],
            where: { isAvailable: true },
            _count: { category: true }
        });
        res.json({
            products,
            categories: categories.map(cat => ({
                name: cat.category,
                count: cat._count.category
            })),
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
        const product = await prisma.product.findUnique({
            where: { id }
        });
        if (!product || !product.isAvailable) {
            return res.status(404).json({
                error: 'Product not found',
                code: 'PRODUCT_NOT_FOUND'
            });
        }
        res.json({ product });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=products.js.map