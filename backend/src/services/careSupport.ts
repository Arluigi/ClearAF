import {z} from 'zod';
import {isDeepStrictEqual as equal} from 'node:util';
import {Prisma, CareTemplateRevision} from '@prisma/client';
import {prisma} from '../config/database';
import {careError,revisionInput} from './routineCare';
import {formInput,responseInput,validateAnswers,questionInput,monthBounds} from './careSupportValidation';
type DB=Prisma.TransactionClient;
const conflict=()=>careError(409,'Revision identity conflicts or content has changed');
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
async function lockPatient(tx:DB,userId:string,clinicianId?:string){await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${userId}::uuid FOR UPDATE`;if(clinicianId){const user=await tx.user.findUnique({where:{id:userId},select:{dermatologistId:true}});if(!user||user.dermatologistId!==clinicianId)throw careError(404,'Patient not found')}}
function templateDTO(row:CareTemplateRevision){return {id:row.templateId,revisionId:row.id,version:row.version,name:row.name,steps:row.steps,isActive:row.isActive,updatedAt:row.updatedAt}}
export async function saveTemplate(ownerId:string,templateId:string,id:string,input:z.infer<typeof revisionInput>){return retry(()=>prisma.$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM public.dermatologists WHERE id=${ownerId}::uuid FOR UPDATE`;
 const latest=await tx.careTemplateRevision.findFirst({where:{templateId},orderBy:{version:'desc'}});
 if(latest&&latest.ownerId!==ownerId)throw careError(404,'Template not found');
 const existing=await tx.careTemplateRevision.findUnique({where:{id}});
 if(existing){if(existing.ownerId!==ownerId)throw careError(404,'Template not found');const prior=await tx.careTemplateRevision.findFirst({where:{templateId,version:existing.version-1}});if(existing.templateId!==templateId||existing.name!==input.name||existing.isActive!==input.isActive||!equal(existing.steps,input.steps)||(prior?.id??null)!==input.expectedRevisionId)throw conflict();return {template:templateDTO(existing),created:false}}
 if((latest?.id??null)!==input.expectedRevisionId)throw conflict();
 const row=await tx.careTemplateRevision.create({data:{id,templateId,ownerId,version:(latest?.version??0)+1,name:input.name,steps:input.steps,isActive:input.isActive}});return {template:templateDTO(row),created:true};
}))}
export async function templates(ownerId:string,page:number,limit:number){return prisma.$transaction(async tx=>{
 const counts=await tx.$queryRaw<{total:bigint}[]>`SELECT count(DISTINCT "templateId") AS total FROM public.care_template_revisions WHERE "ownerId"=${ownerId}::uuid`;
 const rows=await tx.$queryRaw<CareTemplateRevision[]>`SELECT * FROM (SELECT DISTINCT ON ("templateId") * FROM public.care_template_revisions WHERE "ownerId"=${ownerId}::uuid ORDER BY "templateId",version DESC) latest ORDER BY "updatedAt" DESC,id DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`;
 const total=Number(counts[0].total);return {data:rows.map(templateDTO),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
})}
export async function saveForm(userId:string,clinicianId:string,id:string,input:z.infer<typeof formInput>){return retry(()=>prisma.$transaction(async tx=>{
 await lockPatient(tx,userId,clinicianId);const existing=await tx.careFormRevision.findUnique({where:{id}});
 if(existing){const prior=await tx.careFormRevision.findFirst({where:{userId,version:existing.version-1}});if(existing.userId!==userId||existing.createdBy!==clinicianId||existing.title!==input.title||existing.isActive!==input.isActive||!equal(existing.questions,input.questions)||(prior?.id??null)!==input.expectedRevisionId)throw conflict();return {form:existing,created:false}}
 const latest=await tx.careFormRevision.findFirst({where:{userId},orderBy:{version:'desc'}});if((latest?.id??null)!==input.expectedRevisionId)throw conflict();
 const form=await tx.careFormRevision.create({data:{id,userId,createdBy:clinicianId,version:(latest?.version??0)+1,title:input.title,isActive:input.isActive,questions:input.questions}});return {form,created:true};
}))}
export async function currentForm(userId:string,clinicianId?:string){return prisma.$transaction(async tx=>{await lockPatient(tx,userId,clinicianId);return {form:await tx.careFormRevision.findFirst({where:{userId},orderBy:{version:'desc'}})}})}
export async function saveResponse(userId:string,id:string,input:z.infer<typeof responseInput>){return retry(()=>prisma.$transaction(async tx=>{
 await lockPatient(tx,userId);const form=await tx.careFormRevision.findUnique({where:{id:input.formId}});if(!form||form.userId!==userId)throw careError(404,'Form not found');if(!form.isActive)throw careError(400,'Inactive form cannot receive responses');
 validateAnswers(z.array(questionInput).parse(form.questions),input.answers);
 const existing=await tx.careFormResponse.findUnique({where:{id},include:{form:true}});if(existing){if(existing.userId!==userId)throw careError(404,'Response not found');if(existing.formId!==input.formId||existing.submittedAt.getTime()!==Date.parse(input.submittedAt)||!equal(existing.answers,input.answers))throw conflict();return {response:existing,created:false}}
 const response=await tx.careFormResponse.create({data:{id,userId,formId:input.formId,submittedAt:new Date(input.submittedAt),answers:input.answers},include:{form:true}});return {response,created:true};
}))}
export async function responses(userId:string,page:number,limit:number,clinicianId?:string){return prisma.$transaction(async tx=>{await lockPatient(tx,userId,clinicianId);const where={userId};const total=await tx.careFormResponse.count({where});const data=await tx.careFormResponse.findMany({where,include:{form:true},orderBy:[{receivedAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit});return {data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}}})}
export async function calendar(userId:string,month:string,clinicianId?:string){return prisma.$transaction(async tx=>{
 await lockPatient(tx,userId,clinicianId);const {start,end}=monthBounds(month);
 const rows=await tx.$queryRaw<{localDate:string,morning:bigint,evening:bigint}[]>`SELECT c."localDate",count(*) FILTER (WHERE r."timeOfDay"='morning') AS morning,count(*) FILTER (WHERE r."timeOfDay"='evening') AS evening FROM public.care_routine_completions c JOIN public.care_routine_revisions r ON r.id=c."revisionId" AND r."userId"=c."userId" WHERE c."userId"=${userId}::uuid AND c."localDate">=${start} AND c."localDate"<${end} GROUP BY c."localDate" ORDER BY c."localDate"`;
 return {month,days:rows.map(r=>({localDate:r.localDate,morning:Number(r.morning),evening:Number(r.evening)}))};
})}
export async function calendarEvents(userId:string,localDate:string,page:number,limit:number,clinicianId?:string){return prisma.$transaction(async tx=>{await lockPatient(tx,userId,clinicianId);const where={userId,localDate};const total=await tx.careRoutineCompletion.count({where});const data=await tx.careRoutineCompletion.findMany({where,include:{routine:true},orderBy:[{receivedAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit});return {data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}}})}
