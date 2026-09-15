import {Prisma,CareDecision} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../config/database';
import {decisionInput} from './careDecisionsValidation';
type DB=Prisma.TransactionClient;
type Row=CareDecision&{clinician:{name:string}};
export const decisionError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const include={clinician:{select:{name:true}}} as const;
const order=[{createdAt:'desc' as const},{id:'desc' as const}];
const lock=(db:DB,id:string,write:boolean)=>write?db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR UPDATE`:db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR SHARE`;
async function authorize(db:DB,patientId:string,clinicianId:string){const p=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});if(!p||p.dermatologistId!==clinicianId)throw decisionError(404,'NOT_FOUND')}
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
export function decisionDTO(row:Row){return {id:row.id,patientId:row.patientId,clinicianId:row.clinicianId,clinicianName:row.clinician.name,decision:row.decision,patientMessage:row.patientMessage,photoId:row.photoId,refundStatus:row.refundStatus,refundUpdatedAt:row.refundUpdatedAt?.toISOString()??null,createdAt:row.createdAt.toISOString()}}
export async function current(patientId:string){const row=await prisma.careDecision.findFirst({where:{patientId},orderBy:order,include});return {decision:row?decisionDTO(row as Row):null}}
export async function history(patientId:string,clinicianId:string,page:number,limit:number){return prisma.$transaction(async db=>{
 await lock(db,patientId,false);await authorize(db,patientId,clinicianId);
 const total=await db.careDecision.count({where:{patientId}});
 const rows=await db.careDecision.findMany({where:{patientId},orderBy:order,include,skip:(page-1)*limit,take:limit});
 return {data:(rows as Row[]).map(decisionDTO),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
})}
export async function record(patientId:string,clinicianId:string,id:string,input:z.infer<typeof decisionInput>){return retry(()=>prisma.$transaction(async db=>{
 await lock(db,patientId,true);await authorize(db,patientId,clinicianId);
 const existing=await db.careDecision.findUnique({where:{id},include}) as Row|null;
 if(existing){
  if(existing.patientId!==patientId)throw decisionError(404,'NOT_FOUND');
  if(existing.clinicianId!==clinicianId||existing.decision!==input.decision||existing.patientMessage!==input.patientMessage||existing.photoId!==input.photoId)throw decisionError(409,'DECISION_CONFLICT');
  return {decision:decisionDTO(existing),created:false};
 }
 if(input.photoId&&!await db.skinPhoto.findFirst({where:{id:input.photoId,userId:patientId},select:{id:true}}))throw decisionError(404,'NOT_FOUND');
 const row=await db.careDecision.create({data:{id,patientId,clinicianId,decision:input.decision,patientMessage:input.patientMessage,photoId:input.photoId,refundStatus:input.decision==='async_care'?'not_applicable':'pending'},include}) as Row;
 return {decision:decisionDTO(row),created:true};
}))}
export async function markRefundIssued(patientId:string,clinicianId:string,id:string){return prisma.$transaction(async db=>{
 await lock(db,patientId,true);await authorize(db,patientId,clinicianId);
 const row=await db.careDecision.findFirst({where:{id,patientId},include}) as Row|null;
 if(!row)throw decisionError(404,'NOT_FOUND');
 if(row.refundStatus==='issued')return {decision:decisionDTO(row)};
 if(row.refundStatus!=='pending')throw decisionError(409,'REFUND_NOT_PENDING');
 const saved=await db.careDecision.update({where:{id},data:{refundStatus:'issued',refundUpdatedAt:new Date()},include}) as Row;
 return {decision:decisionDTO(saved)};
})}
