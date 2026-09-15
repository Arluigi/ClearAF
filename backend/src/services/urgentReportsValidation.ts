import {z} from 'zod';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const text=z.string().trim().min(1).max(2000);
export const CATEGORIES=['reaction_to_treatment','rapid_worsening','pain_or_infection','other'] as const;
export const reportInput=z.object({category:z.enum(CATEGORIES),description:text}).strict();
export const resolveInput=z.object({resolutionNote:text.nullable()}).strict();
export const emptyBody=z.object({}).strict();
export const pageQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
