import {randomUUID} from 'node:crypto';
import {prisma} from '../config/database';
import {contracts,UUIDSchema,ReviewSchema,DestinationSchema} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
import {launchEnrollment,launchFingerprint} from './launchEnrollment';
import {launchCheckIns} from './launchCheckIns';
import {authorizeAssignedPatient,currentNCEvidence,assertCareAccess} from './careAccess';
import {prescriptionPage} from './prescriptionRecords';
import {identityObjectPaths} from './identityVerification';
import {ageOn} from './enrollmentRules';
import {completeMedicalHistory} from './launchEnrollmentValidation';
import {requiredClinicalSlots,validateClinicalPhotoItems} from './clinicalPhotoSets';
import {validateLaunchDocuments} from '../content/launchConsents';
import {queueRejectionRefund} from './billingLifecycle';
const iso=(v:any)=>new Date(v).toISOString();
const reviewDTO=(r:any)=>ReviewSchema.parse({id:r.id,targetType:r.targetType,targetId:r.targetId,outcome:r.outcome,patientMessage:r.patientMessage,createdAt:iso(r.createdAt),clinicianId:r.clinicianId});
export function createLaunchReview({db,now=()=>new Date(),enrollmentDTO=launchEnrollment.readDTO,checkInDTO=launchCheckIns.readDTO,sign}:{db:any;now?:()=>Date;enrollmentDTO?:(tx:any,row:any)=>Promise<any>;checkInDTO?:(tx:any,row:any)=>Promise<any>;sign?:(path:string,seconds:number)=>Promise<any>}){
 const caseFor=async(tx:any,patientId:string)=>{const r=await tx.launchCase.findUnique({where:{patientId}});if(!r)throw enrollmentError(404,'NOT_FOUND');return r};
 async function page(tx:any,model:string,patientId:string,q:any,convert:(r:any)=>any){const where={patientId},total=await tx[model].count({where}),rows=await tx[model].findMany({where,orderBy:[{[model==='launchCheckIn'?'dueAt':'createdAt']:'desc'},{id:'desc'}],skip:((q.page??1)-1)*(q.limit??20),take:q.limit??20});return {data:await Promise.all(rows.map(convert)),pagination:{page:q.page??1,limit:q.limit??20,total,totalPages:Math.ceil(total/(q.limit??20))}}}
 async function response(tx:any,row:any,review:any,checkIn:any,created:boolean){return {review:reviewDTO(review),enrollment:await enrollmentDTO(tx,row),checkIn:checkIn?await checkInDTO(tx,checkIn):null,created}}
 async function complete(tx:any,row:any,id:any,m:any){
  if(!id||id.status!=='approved'||id.patientId!==row.patientId||id.caseId!==row.id)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
  assertCareAccess(row,m,'approval',now(),await currentNCEvidence(tx,row.patientId,id));
  if(row.status!=='submitted'||!row.submittedAt||!row.settingsVersion||!row.eligibility?.eligible)throw enrollmentError(409,'INCOMPLETE_CASE');
  const intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null,set=row.photoSetId?await tx.clinicalPhotoSet.findUnique({where:{id:row.photoSetId}}):null,settings=await tx.launchSettings.findUnique({where:{version:row.settingsVersion}});
  let answers:any,docs:any[];try{answers=completeMedicalHistory(intake?.answers);docs=validateLaunchDocuments(settings?.content?.consents);const dest=DestinationSchema.parse(row.destination);if(dest.planId!==m.planId)throw Error()}catch{throw enrollmentError(409,'INCOMPLETE_CASE')}
  if(!intake||intake.patientId!==row.patientId||intake.caseId!==row.id||!intake.submittedAt||intake.questionnaireVersion!==settings.contentVersion||!set||set.patientId!==row.patientId||set.caseId!==row.id||set.status!=='submitted')throw enrollmentError(409,'INCOMPLETE_CASE');
  const receipts=await tx.consentAcceptance.findMany({where:{userId:row.patientId}});if(!docs.every(d=>receipts.some((r:any)=>r.documentKey===d.key&&r.documentVersion===d.version&&r.documentSha256===d.sha256)))throw enrollmentError(409,'INCOMPLETE_CASE');
  const items=await tx.clinicalPhotoSetItem.findMany({where:{setId:set.id}});await validateClinicalPhotoItems(tx,row.patientId,set.id,items,requiredClinicalSlots(answers),{purpose:'enrollment',id:row.id});
 }
 return {
 async queue(clinicianId:string,input:unknown={}){const q=contracts['GET /review-queue'].request.parse(input),page=q.page??1,limit=q.limit??20;return db.$transaction(async(tx:any)=>{if(!await tx.dermatologist.findUnique({where:{id:clinicianId}}))return {data:[],pagination:{page,limit,total:0,totalPages:0}};const patients=await tx.user.findMany({where:{dermatologistId:clinicianId},orderBy:{id:'asc'}}),items:any[]=[];
  // Recheck assignment under each profile lock; queue rows expose metadata only.
  for(const p of patients){try{await authorizeAssignedPatient(tx,p.id,clinicianId)}catch(e){if((e as any).statusCode===404)continue;throw e}const row=await tx.launchCase.findUnique({where:{patientId:p.id}});if(!row)continue;
   if(row.submittedAt&&row.status==='submitted'){const id=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null;if(id?.status==='uploaded')items.push({id:id.id,patientId:p.id,patientName:p.name??null,kind:'identity',targetId:id.id,receivedAt:iso(row.submittedAt),flags:row.flags??[]});items.push({id:row.id,patientId:p.id,patientName:p.name??null,kind:'enrollment',targetId:row.id,receivedAt:iso(row.submittedAt),flags:row.flags??[]})}
   for(const c of await tx.launchCheckIn.findMany({where:{patientId:p.id,status:'submitted'}}))items.push({id:c.id,patientId:p.id,patientName:p.name??null,kind:'check_in',targetId:c.id,receivedAt:iso(c.submittedAt),flags:[...(c.answers?.physicallyInNC===false?['outside_nc']:[]),...(c.answers?.sideEffects?.none===false?['side_effects']:[]),...(['pregnant','breastfeeding','trying','not_sure'].includes(c.answers?.pregnancyStatus)?['pregnancy_safe_review']:[]),...(c.answers?.newMedicines?.none===false?['new_medicines']:[])]});
  }
  const rows=items.filter(r=>!q.kind||r.kind===q.kind).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.id.localeCompare(b.id)||a.kind.localeCompare(b.kind)),total=rows.length;return {data:rows.slice((page-1)*limit,page*limit),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}}})},
 async chart(patientId:string,clinicianId:string,input:unknown={}){UUIDSchema.parse(patientId);const q=contracts['GET /patients/:patientId/chart'].request.parse(input);return db.$transaction(async(tx:any)=>{await authorizeAssignedPatient(tx,patientId,clinicianId);const row=await tx.launchCase.findUnique({where:{patientId}});if(!row)return {careModel:'legacy' as const};return {careModel:'launch' as const,enrollment:await enrollmentDTO(tx,row),checkIns:await page(tx,'launchCheckIn',patientId,q,r=>checkInDTO(tx,r)),reviews:await page(tx,'launchReview',patientId,q,reviewDTO),prescriptions:await prescriptionPage(tx,patientId,q.page??1,q.limit??20)}})},
 async images(patientId:string,clinicianId:string,identityId:string){UUIDSchema.parse(patientId);UUIDSchema.parse(identityId);return db.$transaction(async(tx:any)=>{await authorizeAssignedPatient(tx,patientId,clinicianId);const row=await caseFor(tx,patientId),id=await tx.identityVerification.findUnique({where:{id:identityId}});if(!id||id.patientId!==patientId||id.caseId!==row.id)throw enrollmentError(404,'NOT_FOUND');const paths=identityObjectPaths(patientId,identityId);if(id.idPhotoPath!==paths.idPhotoPath||id.selfiePath!==paths.selfiePath||!sign)throw enrollmentError(404,'NOT_FOUND');return {idPhoto:await sign(paths.idPhotoPath,300),selfie:await sign(paths.selfiePath,300)}})},
 async review(patientId:string,clinicianId:string,reviewId:string,input:unknown){UUIDSchema.parse(patientId);UUIDSchema.parse(reviewId);const a=contracts['PUT /patients/:patientId/reviews/:reviewId'].request.parse(input);if(a.outcome==='needs_changes'&&!a.patientMessage?.trim())throw enrollmentError(400,'VALIDATION_ERROR');return db.$transaction(async(tx:any)=>{
  await authorizeAssignedPatient(tx,patientId,clinicianId);let row=await caseFor(tx,patientId);const hash=launchFingerprint(a),old=await tx.launchReview.findUnique({where:{id:reviewId}});
  if(old){if(old.patientId!==patientId||old.caseId!==row.id)throw enrollmentError(404,'NOT_FOUND');if(old.clinicianId!==clinicianId||old.requestHash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');const c=old.targetType==='check_in'?await tx.launchCheckIn.findUnique({where:{id:old.targetId}}):null;return response(tx,row,old,c,false)}
  if(row.revision!==a.expectedRevision)throw enrollmentError(409,'REVISION_CONFLICT');
  const id=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null,m=await tx.careMembership.findUnique({where:{patientId}});let c:any=null,changes:any={};
  if(a.targetType==='identity'){
   if(!id||id.id!==a.targetId||id.patientId!==patientId||id.caseId!==row.id)throw enrollmentError(404,'NOT_FOUND');if(!row.submittedAt||row.status!=='submitted'||id.status!=='uploaded')throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
   if(a.outcome==='approve'){
    const paths=identityObjectPaths(patientId,id.id);
    if(id.idPhotoPath!==paths.idPhotoPath||id.selfiePath!==paths.selfiePath||!id.attestedInNC||ageOn(new Date(id.dateOfBirth).toISOString().slice(0,10),now().toISOString().slice(0,10))<18)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
    assertCareAccess(row,m,'approval',now(),await currentNCEvidence(tx,patientId,id));
   }
   await tx.identityVerification.update({where:{id:id.id},data:{status:a.outcome==='approve'?'approved':a.outcome==='reject'?'rejected':'needs_changes',reviewedAt:now(),reviewedBy:clinicianId,patientMessage:a.patientMessage}});
   if(a.outcome==='needs_changes')changes={status:'needs_changes',patientMessage:a.patientMessage};
  }else if(a.targetType==='case'){
   if(a.targetId!==row.id)throw enrollmentError(404,'NOT_FOUND');if(row.status!=='submitted')throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
   if(a.outcome==='approve'){await complete(tx,row,id,m);changes={status:'approved',approvedAt:now(),patientMessage:a.patientMessage};await tx.careMembership.update({where:{id:m.id},data:{status:'active',activatedAt:now(),cadenceAnchor:now()}})}else if(a.outcome==='needs_changes')changes={status:'needs_changes',patientMessage:a.patientMessage};
  }else{
   c=await tx.launchCheckIn.findUnique({where:{id:a.targetId}});if(!c||c.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');if(c.status!=='submitted')throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
   c=await tx.launchCheckIn.update({where:{id:c.id},data:{status:a.outcome==='needs_changes'?'needs_changes':'reviewed',reviewedAt:now(),patientMessage:a.patientMessage}});
  }
  if(a.outcome==='reject'&&a.targetType!=='check_in'){
   if(!m)throw enrollmentError(403,'CARE_ACCESS_REQUIRED');changes={status:'rejected',patientMessage:a.patientMessage};const decision=await tx.careDecision.create({data:{id:randomUUID(),patientId,clinicianId,decision:'refer_out',patientMessage:a.patientMessage,photoId:null,refundStatus:'pending',createdAt:now()}});await queueRejectionRefund(tx,{membership:m,decisionId:decision.id,now:now()});
  }
  row=await tx.launchCase.update({where:{id:row.id},data:{...changes,revision:row.revision+1}});
  const review=await tx.launchReview.create({data:{id:reviewId,patientId,caseId:row.id,clinicianId,targetType:a.targetType,targetId:a.targetId,outcome:a.outcome,patientMessage:a.patientMessage,caseRevision:a.expectedRevision,requestHash:hash,createdAt:now()}});return response(tx,row,review,c,true);
 })}
 };
}
export const launchReview=createLaunchReview({db:prisma,sign:async(path,seconds)=>{const {supabaseAdmin,PHOTO_BUCKET}=await import('../config/supabase');const {data,error}=await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(path,seconds);if(error||!data?.signedUrl)throw enrollmentError(503,'BILLING_UNAVAILABLE');return {url:data.signedUrl,expiresAt:new Date(Date.now()+seconds*1000).toISOString()}}});
