import {z} from 'zod';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const note=z.string().trim().min(1).max(2000);
export const DECISIONS=['async_care','refer_out','needs_in_person'] as const;
export const decisionInput=z.object({decision:z.enum(DECISIONS),patientMessage:note.nullable(),photoId:uuid.nullable()}).strict();
export const refundInput=z.object({refundStatus:z.literal('issued')}).strict();
export const pageQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
