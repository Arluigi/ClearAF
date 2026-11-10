import {z} from 'zod';
export const ENROLLMENT_22='2.2-pending-review';
export const isEnrollment22=(version:unknown)=>version===ENROLLMENT_22;
export const ProgressStepSchema=z.enum(['eligibility','consents','payment','identity','medical_history','photos','destination']);
export const IdentityIneligibleSchema=z.object({expectedRevision:z.number().int().nonnegative(),reason:z.enum(['under_18','outside_nc'])}).strict();
const short=z.string().max(200), text=z.string().max(2000);
export const ConsentDraftSchema=z.object({key:z.enum(['telehealth','medication','privacy_notice','subscription_terms']),version:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const DestinationDraftSchema=z.object({planId:z.enum(['care','all_in']),name:short,line1:short,line2:short,city:short,state:short,postalCode:short,phone:short}).strict();
export const QuickDraftSchema=z.object({E1:z.enum(['acne','dark_marks','something_else']).optional(),E2:z.enum(['yes','no']).optional(),E3:z.enum(['pregnant','breastfeeding','neither','not_applicable']).optional(),E4:z.enum(['yes','no']).optional()}).strict();
export const ProgressInputSchema=z.object({expectedRevision:z.number().int().nonnegative(),step:ProgressStepSchema,topicId:z.string().max(80).nullable(),eligibilityDraft:QuickDraftSchema.optional(),consentDraft:z.array(ConsentDraftSchema).max(4).optional(),destinationDraft:DestinationDraftSchema.optional(),selectedPlan:z.enum(['care','all_in']).optional()}).strict();
export const IdentityDraftInputSchema=z.object({expectedRevision:z.string().regex(/^\d+$/),fullName:short,dateOfBirth:z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)]),physicallyInNC:z.enum(['true','false']),idPhoto:z.instanceof(Buffer).optional(),selfie:z.instanceof(Buffer).optional()}).strict();
const signed=z.object({url:z.string().url(),expiresAt:z.string().datetime()}).strict();
export const EnrollmentProgressSchema=ProgressInputSchema.omit({expectedRevision:true}).extend({identityDraft:z.object({fullName:short,dateOfBirth:z.string().nullable(),physicallyInNC:z.boolean(),idPhoto:signed.nullable(),selfie:signed.nullable()}).strict().optional()}).strict();
export const MedicalSectionSchema=z.object({id:short,title:short,intro:text,questionIds:z.array(short).min(1)}).strict();
// Existing v2 question arrays remain unchanged: this additive mapping changes presentation only.
export const EnrollmentFlowSchema=z.object({expectation:text,quickEligibilityQuestions:z.array(z.unknown()).length(4),medicalSections:z.array(MedicalSectionSchema).length(6)}).strict();
export function clinical22Complete(evaluation:{missingRequired:string[];exitPage:string|null}){return !evaluation.exitPage&&evaluation.missingRequired.every(id=>['F2','G1','G2'].includes(id))}
