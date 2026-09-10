import { PrismaClient } from '@prisma/client';

// Reuse one pool per server instance, including warm Vercel invocations.
export const prisma = new PrismaClient();
