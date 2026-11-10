import {z} from 'zod';

// Shared operator validation must not initialize Prisma or load runtime configuration.
export const uuid = z.string().uuid().transform(value => value.toLowerCase());
export const revisionInput = z.object({
  expectedRevisionId: uuid.nullable(),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
  steps: z.array(z.object({title: z.string().trim().min(1).max(120), instructions: z.string().max(2000)}).strict()).max(20)
}).strict().refine(value => !value.isActive || value.steps.length > 0, 'Active routine requires steps');
