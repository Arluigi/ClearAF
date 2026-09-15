import {z} from 'zod';
import {STATE_CODES,PREGNANCY_STATUSES} from './enrollmentRules';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const realDate=(v:string)=>{const d=new Date(`${v}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v};
export const dateOfBirth=z.string().refine(realDate,'Invalid date').refine(v=>v>='1900-01-01'&&v<=new Date().toISOString().slice(0,10),'Date of birth out of range');
export const screeningInput=z.object({stateCode:z.enum(STATE_CODES),dateOfBirth,pregnancyStatus:z.enum(PREGNANCY_STATUSES)}).strict();
export const waitlistInput=z.object({screeningId:uuid}).strict();
export const consentInput=z.object({documentSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const consentVersion=z.string().regex(/^[1-9]\d{0,5}$/).transform(Number);
