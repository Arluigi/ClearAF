import {z} from 'zod';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
export const referenceInput=z.object({type:z.enum(['photo','routineRevision']),id:uuid}).strict();
export const messageInput=z.object({content:z.string().trim().min(1).max(4000),reference:referenceInput.nullable()}).strict();
export const readInput=z.object({messageIds:z.array(uuid).min(1).max(50).refine(v=>new Set(v).size===v.length,'Duplicate message IDs')}).strict();
const limit=z.string().regex(/^[1-9]\d?$/).transform(Number).refine(v=>v<=50);
export const pageInput=z.object({limit:limit.default('30'),before:z.string().max(1024).optional()}).strict();
export const inboxInput=z.object({limit:limit.default('20'),cursor:z.string().max(1024).optional()}).strict();
export const messageCursor=z.object({v:z.literal(1),patientId:uuid,clinicianId:uuid,sentAt:z.string().refine(v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v),id:uuid}).strict();
export const inboxCursor=z.object({v:z.literal(1),clinicianId:uuid,patientId:uuid}).strict();
export const encodeCursor=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function decodeCursor<T extends z.ZodTypeAny>(raw:string,schema:T):z.infer<T>{
 const valid=z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).parse(raw);
 try{const decoded=Buffer.from(valid,'base64url');if(decoded.toString('base64url')!==valid)throw Error();return schema.parse(JSON.parse(decoded.toString('utf8')))}catch{throw new z.ZodError([{code:'custom',path:['cursor'],message:'Invalid cursor'}])}
}
