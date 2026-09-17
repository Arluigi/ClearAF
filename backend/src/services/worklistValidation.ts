import {z} from 'zod';
import {dayInput} from './careSupportValidation';
// Validation is independent of database/session initialization.
export const WORKLIST_FILTERS=['needs-review','all','flagged'] as const;
export type WorklistFilter=typeof WORKLIST_FILTERS[number];
const decimal=(min:number,max:number,fallback:number)=>z.string().regex(/^\d+$/).default(String(fallback)).transform(Number).pipe(z.number().safe().int().min(min).max(max));
export const worklistQuery=z.object({
 filter:z.enum(WORKLIST_FILTERS).default('needs-review'),
 page:decimal(1,10_000,1),
 limit:decimal(1,50,20),
 // Same bound and trimming as GET /users search.
 search:z.string().trim().max(100).optional().transform(value=>value||undefined),
 // The clinician's local date anchors the 14-day window, like GET /routines/patients/:id?localDate=.
 localDate:dayInput,
}).strict();
export type WorklistQuery=z.infer<typeof worklistQuery>;
