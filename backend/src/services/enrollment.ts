import {Prisma,EligibilityScreening,ConsentAcceptance} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../config/database';
import {currentConsent} from '../content/consent';
import {evaluate,rulesFromEnv,RULES_VERSION,EligibilityRules,ScreeningAnswers} from './enrollmentRules';
import {screeningInput} from './enrollmentValidation';
type DB=Prisma.TransactionClient;
export type EnrollmentStatus='screening_required'|'ineligible'|'consent_required'|'enrolled';
export const enrollmentError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const utcToday=()=>new Date().toISOString().slice(0,10);
const iso=(d:Date|null)=>d?d.toISOString():null;
export function screeningDTO(row:EligibilityScreening){return {id:row.id,stateCode:row.stateCode,dateOfBirth:row.dateOfBirth.toISOString().slice(0,10),pregnancyStatus:row.pregnancyStatus,eligible:row.eligible,reasons:row.reasons,flags:row.flags,rulesVersion:row.rulesVersion,submittedAt:row.submittedAt.toISOString(),waitlistRequestedAt:iso(row.waitlistRequestedAt)}}
const latest=(db:DB,userId:string)=>db.eligibilityScreening.findFirst({where:{userId},orderBy:[{submittedAt:'desc'},{id:'desc'}]});
async function evaluateStatus(db:DB,userId:string){
 const screening=await latest(db,userId),consent=currentConsent();
 const acceptance:ConsentAcceptance|null=screening?.eligible?await db.consentAcceptance.findUnique({where:{userId_documentVersion:{userId,documentVersion:consent.version}}}):null;
 const status:EnrollmentStatus=!screening?'screening_required':!screening.eligible?'ineligible':!acceptance?'consent_required':'enrolled';
 return {status,screening,acceptance,consent};
}
const lock=(db:DB,userId:string,write:boolean)=>write?db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${userId}::uuid FOR UPDATE`:db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${userId}::uuid FOR SHARE`;
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
export async function enrollmentStatus(userId:string){return prisma.$transaction(async db=>{
 const s=await evaluateStatus(db,userId);
 return {status:s.status,rulesVersion:RULES_VERSION,screening:s.screening&&screeningDTO(s.screening),consent:{version:s.consent.version,title:s.consent.title,body:s.consent.body,sha256:s.consent.sha256,acceptedAt:iso(s.acceptance?.acceptedAt??null)}};
})}
export async function isEnrolled(userId:string){return (await evaluateStatus(prisma as unknown as DB,userId)).status==='enrolled'}
export async function submitScreening(userId:string,id:string,input:z.infer<typeof screeningInput>,deps:{rules?:EligibilityRules;today?:string}={}){
 const rules=deps.rules??rulesFromEnv(),today=deps.today??utcToday();
 return retry(()=>prisma.$transaction(async db=>{
  await lock(db,userId,true);
  const existing=await db.eligibilityScreening.findUnique({where:{id}});
  if(existing){
   if(existing.userId!==userId)throw enrollmentError(404,'NOT_FOUND');
   if(existing.stateCode!==input.stateCode||screeningDTO(existing).dateOfBirth!==input.dateOfBirth||existing.pregnancyStatus!==input.pregnancyStatus)throw enrollmentError(409,'SCREENING_CONFLICT');
   return {screening:screeningDTO(existing),status:(await evaluateStatus(db,userId)).status,created:false};
  }
  // zod's ZodObject output type marks keys optional in its own structural encoding even when required
  // (a TS/zod-3.25 interaction, not a real optionality); the shape is enforced by screeningInput.parse.
  const result=evaluate(input as ScreeningAnswers,rules,today);
  const row=await db.eligibilityScreening.create({data:{id,userId,stateCode:input.stateCode,dateOfBirth:new Date(`${input.dateOfBirth}T00:00:00Z`),pregnancyStatus:input.pregnancyStatus,eligible:result.eligible,reasons:result.reasons,flags:result.flags,rulesVersion:RULES_VERSION}});
  return {screening:screeningDTO(row),status:(await evaluateStatus(db,userId)).status,created:true};
 }));
}
export async function requestWaitlist(userId:string,screeningId:string){return prisma.$transaction(async db=>{
 await lock(db,userId,true);
 const row=await latest(db,userId);
 if(!row||row.id!==screeningId)throw enrollmentError(404,'NOT_FOUND');
 if(row.eligible)throw enrollmentError(409,'NOT_INELIGIBLE');
 const saved=row.waitlistRequestedAt?row:await db.eligibilityScreening.update({where:{id:row.id},data:{waitlistRequestedAt:new Date()}});
 return {screening:screeningDTO(saved)};
})}
export async function acceptConsent(userId:string,version:number,sha256:string){return retry(()=>prisma.$transaction(async db=>{
 await lock(db,userId,true);
 const s=await evaluateStatus(db,userId);
 if(version!==s.consent.version||sha256!==s.consent.sha256)throw enrollmentError(409,'CONSENT_OUTDATED');
 if(s.status==='screening_required'||s.status==='ineligible')throw enrollmentError(409,'SCREENING_REQUIRED');
 const row=s.acceptance??await db.consentAcceptance.create({data:{userId,documentVersion:version,documentSha256:sha256}});
 return {acceptance:{version:row.documentVersion,acceptedAt:row.acceptedAt.toISOString()},status:'enrolled' as EnrollmentStatus,created:!s.acceptance};
}))}
export async function clinicianSummary(patientId:string,clinicianId:string){return prisma.$transaction(async db=>{
 await lock(db,patientId,false);
 const patient=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});
 if(!patient||patient.dermatologistId!==clinicianId)throw enrollmentError(404,'NOT_FOUND');
 const s=await evaluateStatus(db,patientId);
 return {status:s.status,screening:s.screening&&screeningDTO(s.screening),screeningCount:await db.eligibilityScreening.count({where:{userId:patientId}}),consent:{version:s.consent.version,acceptedAt:iso(s.acceptance?.acceptedAt??null)}};
})}
