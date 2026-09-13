import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {prisma} from '../config/database';
import {uuid} from './routineCare';
export const statusQuery=z.object({photoIds:z.string().max(1849).transform(value=>value.split(',')).pipe(z.array(uuid).min(1).max(50)).refine(ids=>new Set(ids).size===ids.length,'Duplicate photo IDs')}).strict();
export const emptyReviewBody=z.object({}).strict();
export const reviewError=(statusCode:number,message:string)=>Object.assign(new Error(message),{statusCode,code:statusCode===404?'NOT_FOUND':'PHOTO_REVIEW_ERROR'});
type Identity={id:string;userType:'patient'|'dermatologist'};
const selection={photoId:true,reviewedAt:true,reviewer:{select:{name:true}}} as const;
const serialize=(row:{photoId:string;reviewedAt:Date;reviewer:{name:string}})=>({photoId:row.photoId,reviewerName:row.reviewer.name,reviewedAt:row.reviewedAt});
export async function reviewStatus(photoIds:string[],identity:Identity){
 return prisma.$transaction(async tx=>{
  // Lock all involved profiles in a stable order, then recheck current assignment.
  const photos=await tx.skinPhoto.findMany({where:{id:{in:photoIds}},select:{id:true,userId:true}});
  if(photos.length!==photoIds.length)throw reviewError(404,'Photo not found');
  const owners=[...new Set(photos.map(p=>p.userId))].sort();
  for(const owner of owners){
   await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${owner}::uuid FOR SHARE`;
   const patient=await tx.user.findUnique({where:{id:owner},select:{dermatologistId:true}});
   if(!patient||(identity.userType==='patient'?owner!==identity.id:patient.dermatologistId!==identity.id))throw reviewError(404,'Photo not found');
  }
  return {reviews:(await tx.photoReview.findMany({where:{photoId:{in:photoIds}},select:selection})).map(serialize)};
 });
}
export async function markReviewed(photoId:string,clinicianId:string){
 return prisma.$transaction(async tx=>{
  const photo=await tx.skinPhoto.findUnique({where:{id:photoId},select:{userId:true}});
  if(!photo)throw reviewError(404,'Photo not found');
  await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${photo.userId}::uuid FOR UPDATE`;
  const patient=await tx.user.findUnique({where:{id:photo.userId},select:{dermatologistId:true}});
  const current=await tx.skinPhoto.findUnique({where:{id:photoId},select:{userId:true}});
  if(!patient||patient.dermatologistId!==clinicianId||current?.userId!==photo.userId)throw reviewError(404,'Photo not found');
  const existing=await tx.photoReview.findUnique({where:{photoId},select:selection});
  if(existing)return{review:serialize(existing),created:false};
  const row=await tx.photoReview.create({data:{photoId,reviewerId:clinicianId},select:selection});
  return{review:serialize(row),created:true};
 });
}
export async function reviewQueue(clinicianId:string,page:number,limit:number){
 const scope=Prisma.sql`FROM public.user_profiles u JOIN public.skin_photos p ON p."userId"=u.id LEFT JOIN public.photo_reviews r ON r."photoId"=p.id WHERE u."dermatologistId"=${clinicianId}::uuid AND r."photoId" IS NULL`;
 return prisma.$transaction(async tx=>{
  const counts=await tx.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT count(DISTINCT u.id) AS total ${scope}`);
  const rows=await tx.$queryRaw<Array<{patientId:string;name:string|null;unreviewedCount:bigint;oldestUploadAt:Date;latestUploadAt:Date}>>(Prisma.sql`SELECT u.id AS "patientId",u.name,count(*) AS "unreviewedCount",min(p."createdAt") AS "oldestUploadAt",max(p."createdAt") AS "latestUploadAt" ${scope} GROUP BY u.id,u.name ORDER BY "oldestUploadAt",u.id LIMIT ${limit} OFFSET ${(page-1)*limit}`);
  const total=Number(counts[0].total);
  return{data:rows.map(row=>({...row,unreviewedCount:Number(row.unreviewedCount)})),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
