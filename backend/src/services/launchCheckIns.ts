// Calendar arithmetic uses the clinical jurisdiction, never the server/device zone.
const zone='America/New_York';
function parts(date:Date){const p=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(k:string)=>Number(p.find(x=>x.type===k)!.value);return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second'),ms:date.getUTCMilliseconds()}}
function instant(p:ReturnType<typeof parts>){
 const wallValue=(v:ReturnType<typeof parts>)=>Date.UTC(v.year,v.month-1,v.day,v.hour,v.minute,v.second,v.ms),wall=wallValue(p);
 const offsets=new Set([-36,0,36].map(hours=>{const sample=wall+hours*3600000;return wallValue(parts(new Date(sample)))-sample}));
 const candidates=[...offsets].map(offset=>wall-offset).sort((a,b)=>a-b),exact=candidates.filter(value=>wallValue(parts(new Date(value)))===wall);
 // Temporal-compatible disambiguation: earlier fold, forward through a nonexistent spring hour.
 if(exact.length)return new Date(exact[0]);
 const forward=candidates.filter(value=>wallValue(parts(new Date(value)))>wall).sort((a,b)=>wallValue(parts(new Date(a)))-wallValue(parts(new Date(b))));
 return new Date(forward[0]);
}
function calendarDays(anchor:Date,days:number){const p=parts(anchor),d=new Date(Date.UTC(p.year,p.month-1,p.day+days));return instant({...p,year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()})}
function calendarMonths(anchor:Date,months:number){const p=parts(anchor),d=new Date(Date.UTC(p.year,p.month-1+months,1));return instant({...p,year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:Math.min(p.day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate())})}
export function launchOccurrence(plan:'care'|'all_in',anchor:Date,ordinal:number):{dueAt:Date;kind:'weekly'|'monthly'}{if(!Number.isSafeInteger(ordinal)||ordinal<1||!Number.isFinite(anchor.getTime()))throw Error('Invalid cadence');if(plan==='all_in'&&ordinal<=8)return {dueAt:calendarDays(anchor,ordinal*7),kind:'weekly'};return {dueAt:calendarMonths(plan==='all_in'?calendarDays(anchor,56):anchor,plan==='all_in'?ordinal-8:ordinal),kind:'monthly'}}

import {randomUUID} from 'node:crypto';
import {prisma} from '../config/database';
import {CheckInSchema,contracts,UUIDSchema,PhotoSetSchema,PhotoSet} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
import {assertCareAccess,careAccess} from './careAccess';
import {launchFingerprint} from './launchEnrollment';
import {validateLaunchCheckInContent,followUpFormAnswers} from '../content/launchCheckIn';
import {requiredClinicalSlots,validateClinicalPhotoItems,assertCurrentCheckIn,assertCheckInPhotoDate} from './clinicalPhotoSets';
import {questionInput,normalizeLaunchFollowUp} from './careSupportValidation';
import {z} from 'zod';
const iso=(v:any)=>v==null?null:new Date(v).toISOString();
export function createLaunchCheckIns({db,now=()=>new Date()}:{db:any;now?:()=>Date}){
 async function lock(tx:any,patientId:string){await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${patientId}::uuid FOR UPDATE`;const user=await tx.user.findUnique({where:{id:patientId}});if(!user)throw enrollmentError(404,'NOT_FOUND');return user}
 async function owned(tx:any,patientId:string,id:string){const row=await tx.launchCheckIn.findUnique({where:{id}});if(!row||row.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');return row}
 async function context(tx:any,patientId:string){return {caseRow:await tx.launchCase.findUnique({where:{patientId}}),membership:await tx.careMembership.findUnique({where:{patientId}})}}
 async function photoDTO(tx:any,set:any):Promise<PhotoSet>{return PhotoSetSchema.parse({id:set.id,purpose:set.purpose,status:set.status,requiredSlots:set.requiredSlots,items:(await tx.clinicalPhotoSetItem.findMany({where:{setId:set.id}})).map(({slot,photoId,captureId}:any)=>({slot,photoId,captureId}))}) as PhotoSet}
 async function dto(tx:any,row:any){const form=await tx.careFormRevision.findUnique({where:{id:row.formId}});if(!form||form.userId!==row.patientId)throw enrollmentError(409,'REVISION_CONFLICT');let set=row.photoSetId?await tx.clinicalPhotoSet.findUnique({where:{id:row.photoSetId}}):null;
  // Resume corrections from the server without replacing the last immutable submitted photo association.
  if(row.status==='needs_changes'){const drafts=await tx.clinicalPhotoSet.findMany({where:{checkInId:row.id,patientId:row.patientId,purpose:'check_in',status:'draft'},orderBy:[{createdAt:'desc'},{id:'desc'}],take:1});if(drafts.length)set=drafts[0]}
  return CheckInSchema.parse({id:row.id,kind:row.kind,status:row.status,formId:row.formId,dueAt:iso(row.dueAt),cadenceAnchor:iso(row.cadenceAnchor),form:{id:form.id,userId:form.userId,version:form.version,createdBy:form.createdBy,createdAt:iso(form.createdAt),title:form.title,isActive:form.isActive,questions:form.questions},responseId:row.responseId??null,photoSet:set?await photoDTO(tx,set):null,answers:row.answers??null,submittedAt:iso(row.submittedAt),reviewedAt:iso(row.reviewedAt),patientMessage:row.patientMessage??null})}
 async function materialize(tx:any,patientId:string,user:any,c:any){const m=c.membership;if(careAccess(c.caseRow,m,now())!=='care'||!m.cadenceAnchor||!c.caseRow.approvedAt)return;
  const anchor=new Date(m.cadenceAnchor);if(anchor<new Date(c.caseRow.approvedAt)||anchor>now())return;
  const old=await tx.launchCheckIn.findMany({where:{membershipId:m.id}});
  for(const row of old)if(new Date(row.cadenceAnchor).getTime()!==anchor.getTime()&&!row.submittedAt&&new Date(row.dueAt)>anchor&&['due','draft'].includes(row.status))await tx.launchCheckIn.update({where:{id:row.id},data:{status:'superseded'}});
  const current=old.filter((row:any)=>new Date(row.cadenceAnchor).getTime()===anchor.getTime());
  let form:any;
  async function assignedForm(){if(form)return form;if(!user.dermatologistId)throw enrollmentError(409,'INCOMPLETE_CASE');const settings=await tx.launchSettings.findFirst({where:{active:true}});let content;try{content=validateLaunchCheckInContent(settings?.content?.checkInForm)}catch{throw enrollmentError(503,'BILLING_UNAVAILABLE')}
   const hash=launchFingerprint(content);const forms=await tx.careFormRevision.findMany({where:{userId:patientId,launchManaged:true,createdBy:user.dermatologistId}});form=forms.find((f:any)=>f.launchContentHash===hash&&f.isActive);if(!form){const latest=await tx.careFormRevision.findFirst({where:{userId:patientId},orderBy:{version:'desc'}});form=await tx.careFormRevision.create({data:{id:randomUUID(),userId:patientId,createdBy:user.dermatologistId,createdAt:now(),version:(latest?.version??0)+1,title:content.title,isActive:true,questions:content.questions,launchManaged:true,launchContentHash:hash,launchContentVersion:content.versionLabel}})}return form;
  }
  // Materialize all obligations that have fallen due and one next occurrence. Always derive from anchor.
  for(let ordinal=1;;ordinal++){const occurrence=launchOccurrence(m.planId,anchor,ordinal);if(!current.some((r:any)=>r.ordinal===ordinal)){const form=await assignedForm();await tx.launchCheckIn.create({data:{id:randomUUID(),membershipId:m.id,patientId,cadenceAnchor:anchor,ordinal,captureAfter:ordinal===1?anchor:launchOccurrence(m.planId,anchor,ordinal-1).dueAt,...occurrence,status:'due',formId:form.id}})}if(occurrence.dueAt>now())break}
 }
 return {
  async list(patientId:string,page=1,limit=20){const query=contracts['GET /check-ins'].request.parse({page,limit});return db.$transaction(async(tx:any)=>{const user=await lock(tx,patientId),c=await context(tx,patientId);await materialize(tx,patientId,user,c);const where={patientId},total=await tx.launchCheckIn.count({where}),rows=await tx.launchCheckIn.findMany({where,orderBy:[{dueAt:'asc'},{id:'asc'}],skip:(query.page-1)*query.limit,take:query.limit});return {data:await Promise.all(rows.map((r:any)=>dto(tx,r))),pagination:{page:query.page,limit:query.limit,total,totalPages:Math.ceil(total/query.limit)}}})},
  async submit(patientId:string,checkInId:string,responseId:string,input:unknown){UUIDSchema.parse(checkInId);UUIDSchema.parse(responseId);const raw=contracts['PUT /check-ins/:checkInId/submissions/:responseId'].request.parse(input),a={...raw,answers:normalizeLaunchFollowUp(raw.answers)};return db.$transaction(async(tx:any)=>{const user=await lock(tx,patientId),row=await owned(tx,patientId,checkInId),c=await context(tx,patientId),hash=launchFingerprint(a);
   // Idempotent old requests return the current projection; they never rewind a corrected/reviewed submission.
   const existing=await tx.launchCheckInSubmission.findUnique({where:{responseId}});if(existing){if(existing.patientId!==patientId||existing.checkInId!==checkInId)throw enrollmentError(404,'NOT_FOUND');if(existing.requestHash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');return {checkIn:await dto(tx,row),created:false}}
   assertCareAccess(c.caseRow,c.membership,'clinical_write',now());if(!c.caseRow||!c.membership)throw enrollmentError(403,'CARE_ACCESS_REQUIRED');assertCurrentCheckIn(row,c.membership);
   if(!['due','draft','needs_changes'].includes(row.status))throw enrollmentError(409,'OPERATION_CONFLICT');
   const form=await tx.careFormRevision.findUnique({where:{id:row.formId}});if(a.formId!==row.formId||!form||form.userId!==patientId||!form.launchManaged||!form.isActive)throw enrollmentError(409,'REVISION_CONFLICT');
   // The occurrence-bound form retains its historical author after reassignment. Queue ownership uses the live assignment.
   if(!user.dermatologistId||!await tx.dermatologist.findUnique({where:{id:user.dermatologistId}}))throw enrollmentError(409,'INCOMPLETE_CASE');
   // A response UUID may not be recycled from any legacy or unrelated response.
   if(await tx.careFormResponse.findUnique({where:{id:responseId}}))throw enrollmentError(409,'OPERATION_CONFLICT');
   const set=await tx.clinicalPhotoSet.findUnique({where:{id:a.photoSetId}});if(!set||set.patientId!==patientId||set.checkInId!==row.id||set.purpose!=='check_in')throw enrollmentError(404,'NOT_FOUND');if(set.status!=='draft')throw enrollmentError(409,'INCOMPLETE_PHOTO_SET');
   const intake=c.caseRow.intakeId?await tx.intakeRevision.findUnique({where:{id:c.caseRow.intakeId}}):null,required=requiredClinicalSlots(intake?.answers??{}),items=(await photoDTO(tx,set)).items;
   await validateClinicalPhotoItems(tx,patientId,set.id,items,required,{purpose:'check_in',id:row.id});
   for(const item of items){const photo=await tx.skinPhoto.findUnique({where:{id:item.photoId}});assertCheckInPhotoDate(row,new Date(photo.captureDate),new Date(photo.createdAt),now())}
   const submittedAt=now(),mapped=followUpFormAnswers(a.answers,z.array(questionInput).parse(form.questions));
   await tx.careFormResponse.create({data:{id:responseId,userId:patientId,formId:form.id,answers:mapped,submittedAt,receivedAt:submittedAt}});
   await tx.clinicalPhotoSet.update({where:{id:set.id},data:{status:'submitted',requiredSlots:required}});
   await tx.launchCheckInSubmission.create({data:{responseId,checkInId:row.id,patientId,formId:form.id,photoSetId:set.id,answers:a.answers,submittedAt,requestHash:hash}});
   const saved=await tx.launchCheckIn.update({where:{id:row.id},data:{responseId,photoSetId:set.id,answers:a.answers,submittedAt,status:'submitted',reviewedAt:null,patientMessage:null}});return {checkIn:await dto(tx,saved),created:true};
  })}
 };
}
export const launchCheckIns=createLaunchCheckIns({db:prisma});
