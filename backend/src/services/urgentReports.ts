import {Prisma,UrgentReport} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../config/database';
import {reportInput} from './urgentReportsValidation';
type DB=Prisma.TransactionClient;
export const urgentError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const lock=(db:DB,id:string,write:boolean)=>write?db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR UPDATE`:db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR SHARE`;
async function authorize(db:DB,patientId:string,clinicianId:string){const p=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});if(!p||p.dermatologistId!==clinicianId)throw urgentError(404,'NOT_FOUND')}
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
const iso=(d:Date|null)=>d?d.toISOString():null;
export function reportDTO(row:UrgentReport){return {id:row.id,patientId:row.patientId,category:row.category,description:row.description,status:row.status,createdAt:row.createdAt.toISOString(),acknowledgedAt:iso(row.acknowledgedAt),resolvedAt:iso(row.resolvedAt),resolutionNote:row.resolutionNote}}
const newest=[{createdAt:'desc' as const},{id:'desc' as const}];
const page=(total:number,p:number,limit:number)=>({page:p,limit,total,totalPages:Math.ceil(total/limit)});
export async function create(patientId:string,id:string,input:z.infer<typeof reportInput>){return retry(()=>prisma.$transaction(async db=>{
 await lock(db,patientId,true);
 const existing=await db.urgentReport.findUnique({where:{id}});
 if(existing){
  if(existing.patientId!==patientId)throw urgentError(404,'NOT_FOUND');
  if(existing.category!==input.category||existing.description!==input.description)throw urgentError(409,'REPORT_ID_CONFLICT');
  return {report:reportDTO(existing),created:false};
 }
 const profile=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});
 if(!profile?.dermatologistId)throw urgentError(409,'NO_ASSIGNED_CLINICIAN');
 const row=await db.urgentReport.create({data:{id,patientId,clinicianId:profile.dermatologistId,category:input.category,description:input.description}});
 return {report:reportDTO(row),created:true};
}))}
export async function mine(patientId:string,p:number,limit:number){
 const where={patientId};
 const [total,rows]=await Promise.all([prisma.urgentReport.count({where}),prisma.urgentReport.findMany({where,orderBy:newest,skip:(p-1)*limit,take:limit})]);
 return {data:rows.map(reportDTO),pagination:page(total,p,limit)};
}
export async function queue(clinicianId:string,p:number,limit:number){return prisma.$transaction(async db=>{
 const where={status:{not:'resolved'},patient:{dermatologistId:clinicianId}};
 const total=await db.urgentReport.count({where});
 const openCount=await db.urgentReport.count({where:{...where,status:'open'}});
 // status desc puts 'open' before 'acknowledged' only because it sorts after it alphabetically; resolved rows are excluded above.
 const rows=await db.urgentReport.findMany({where,orderBy:[{status:'desc'},{createdAt:'asc'},{id:'asc'}],skip:(p-1)*limit,take:limit,include:{patient:{select:{name:true}}}});
 return {data:rows.map(r=>({...reportDTO(r),patientName:r.patient.name})),pagination:page(total,p,limit),openCount};
},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})}
export async function patientHistory(patientId:string,clinicianId:string,p:number,limit:number){return prisma.$transaction(async db=>{
 await lock(db,patientId,false);await authorize(db,patientId,clinicianId);
 const where={patientId};
 const total=await db.urgentReport.count({where});
 const rows=await db.urgentReport.findMany({where,orderBy:newest,skip:(p-1)*limit,take:limit});
 return {data:rows.map(reportDTO),pagination:page(total,p,limit)};
})}
async function transition(reportId:string,clinicianId:string,apply:(row:UrgentReport,now:Date)=>Prisma.UrgentReportUpdateInput|null){return prisma.$transaction(async db=>{
 const found=await db.urgentReport.findUnique({where:{id:reportId},select:{patientId:true}});
 if(!found)throw urgentError(404,'NOT_FOUND');
 await lock(db,found.patientId,true);await authorize(db,found.patientId,clinicianId);
 const row=await db.urgentReport.findUnique({where:{id:reportId}});
 if(!row)throw urgentError(404,'NOT_FOUND');
 const data=apply(row,new Date());
 return {report:reportDTO(data?await db.urgentReport.update({where:{id:reportId},data}):row)};
})}
export const acknowledge=(reportId:string,clinicianId:string)=>transition(reportId,clinicianId,(row,now)=>row.status==='open'?{status:'acknowledged',acknowledgedAt:now,acknowledger:{connect:{id:clinicianId}}}:null);
export const resolve=(reportId:string,clinicianId:string,resolutionNote:string|null)=>transition(reportId,clinicianId,(row,now)=>{
 if(row.status==='resolved'){if(row.resolutionNote!==resolutionNote)throw urgentError(409,'REPORT_RESOLVED');return null}
 return {status:'resolved',resolvedAt:now,resolver:{connect:{id:clinicianId}},resolutionNote,...(row.status==='open'?{acknowledgedAt:now,acknowledger:{connect:{id:clinicianId}}}:{})};
});
