import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Get products
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const category = req.query.category as string;
    const search = req.query.search as string;
    const prescriptionRequired = req.query.prescriptionRequired as string;

    let whereClause: any = {
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
    } else if (prescriptionRequired === 'false') {
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
        isPrescriptionRequired: true,
        _count: {
          subscriptions: true
        }
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' }
      ],
      skip,
      take: limit
    });

    const total = await prisma.product.count({ where: whereClause });

    // Get categories for filtering
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

  } catch (error) {
    next(error);
  }
});

// Get product details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          subscriptions: true,
          prescriptions: true
        }
      }
    });

    if (!product || !product.isAvailable) {
      return res.status(404).json({
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    res.json({ product });

  } catch (error) {
    next(error);
  }
});

export default router;