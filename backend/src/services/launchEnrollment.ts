import {careAccess,requirePatientCareScope} from './careAccess';
import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {prisma} from '../config/database';
import {contracts,UUIDSchema,EnrollmentResponseSchema,DestinationSchema} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
import {evaluateLaunchEligibility,ageOn} from './enrollmentRules';
import {normalizeMedicalDraft,completeMedicalHistory,launchFlags} from './launchEnrollmentValidation';
import {activeLaunchSettings} from './launchSettings';
import {validateLaunchDocuments} from '../content/launchConsents';
import {sanitizeLaunchJPEG,identityObjectPaths,storeLaunchJPEG} from './identityVerification';
import {captureIdentity} from './photoCapture';
import {requiredClinicalSlots,validateClinicalPhotoItems,assertCurrentCheckIn,assertCheckInPhotoDate} from './clinicalPhotoSets';
export const launchFingerprint=(value:unknown):string=>{
 const canonical=(v:any):any=>Buffer.isBuffer(v)?createHash('sha256').update(v).digest('hex'):Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};
const iso=(d:any)=>d===null||d===undefined?null:new Date(d).toISOString();
const noStep=()=>{throw enrollmentError(403,'LAUNCH_STEP_REQUIRED')};
export function createLaunchEnrollment(deps:{db:any;store:(path:string,bytes:Buffer)=>Promise<void>;remove:(path:string)=>Promise<void>;now?:()=>Date}){
 const {db,store}=deps,now=deps.now??(()=>new Date());
 const lock=async(tx:any,patientId:string)=>{await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${patientId}::uuid FOR UPDATE`;if(!await tx.user.findUnique({where:{id:patientId}}))throw enrollmentError(404,'NOT_FOUND')};
 async function uploadTransaction(patientId:string,job:(tx:any,write:(path:string,bytes:Buffer)=>Promise<void>)=>Promise<any>){
  const paths:string[]=[];
  try{return await db.$transaction((tx:any)=>job(tx,async(path,bytes)=>{paths.push(path);await store(path,bytes)}),{timeout:30000})}
  catch(error){
   // Serialize compensation against capture retries and never delete committed chart bytes.
   await db.$transaction(async(tx:any)=>{await lock(tx,patientId);for(const path of paths){
    const photo=await tx.skinPhoto.findFirst({where:{photoUrl:path}}),id=await tx.identityVerification.findFirst({where:{idPhotoPath:path}}),selfie=await tx.identityVerification.findFirst({where:{selfiePath:path}});
    if(photo||id||selfie)continue;
    const photoId=path.split('/')[1].slice(0,36);
    if(!await tx.photoCleanup.findUnique({where:{photoId}}))await tx.photoCleanup.create({data:{photoId,userId:patientId,photoUrl:path}});
   }});
   await db.$transaction(async(tx:any)=>{await lock(tx,patientId);for(const path of paths){const photoId=path.split('/')[1].slice(0,36),intent=await tx.photoCleanup.findUnique({where:{photoId}});if(intent&&intent.photoUrl===path){const committed=await tx.skinPhoto.findFirst({where:{photoUrl:path}})||await tx.identityVerification.findFirst({where:{idPhotoPath:path}})||await tx.identityVerification.findFirst({where:{selfiePath:path}});if(!committed)await deps.remove(path);await tx.photoCleanup.deleteMany({where:{photoId,userId:patientId}})}}});
   throw error;
  }
 }
 const owned=async(tx:any,patientId:string,id:string)=>{const row=await tx.launchCase.findUnique({where:{id}});if(!row||row.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');return row};
 const version=(row:any,expected:number)=>{if(row.revision!==expected)throw enrollmentError(409,'REVISION_CONFLICT')};
 const mutable=(row:any)=>{if(['submitted','approved','rejected','ineligible'].includes(row.status))noStep()};
 const paid=async(tx:any,patientId:string)=>{const m=await tx.careMembership.findUnique({where:{patientId}});if(!m||!['paid_pending_review','active','past_due'].includes(m.status))throw enrollmentError(403,'CARE_ACCESS_REQUIRED');if(!m.paidThrough||new Date(m.paidThrough)<=now())throw enrollmentError(403,'CARE_ACCESS_REQUIRED');return m};
 async function publication(tx:any,settingsVersion?:number){
  const settings=settingsVersion===undefined?await activeLaunchSettings(tx):await tx.launchSettings.findUnique({where:{version:settingsVersion}});if(!settings)throw enrollmentError(503,'BILLING_UNAVAILABLE');try{const docs=validateLaunchDocuments((settings.content as any)?.consents);return {settings,docs}}catch{throw enrollmentError(503,'BILLING_UNAVAILABLE')}
 }
 async function currentReceipts(tx:any,patientId:string,docs:any[]){
  const receipts=await tx.consentAcceptance.findMany({where:{userId:patientId}});
  return docs.map(d=>({...d,acceptedAt:iso(receipts.find((r:any)=>r.documentKey===d.key&&r.documentVersion===d.version&&r.documentSha256===d.sha256)?.acceptedAt)}));
 }
 async function dto(tx:any,row:any){
  const frozen=['submitted','approved','rejected'].includes(row.status);if(frozen&&!row.settingsVersion)throw enrollmentError(503,'BILLING_UNAVAILABLE');
  const {settings,docs}=await publication(tx,frozen?row.settingsVersion:undefined),consents=await currentReceipts(tx,row.patientId,docs);
  const identity=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null;
  const intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null;
  const set=row.photoSetId?await tx.clinicalPhotoSet.findUnique({where:{id:row.photoSetId}}):null;
  const member=await tx.careMembership.findUnique({where:{patientId:row.patientId}});
  const membership=member?{id:member.id,planId:member.planId,status:member.status,amountCents:member.amountCents,currency:member.currency,activatedAt:iso(member.activatedAt),currentPeriodEnd:iso(member.currentPeriodEnd),paidThrough:iso(member.paidThrough),cancelAtPeriodEnd:member.cancelAtPeriodEnd??false,cadenceAnchor:iso(member.cadenceAnchor),destinationRequired:member.destinationRequired??false,refundStatus:member.refundStatus??'not_applicable',access:careAccess(row,member,now())??'enrollment'}:null;
  return EnrollmentResponseSchema.parse({case:{id:row.id,revision:row.revision,status:row.status,identity:identity?{id:identity.id,status:identity.status,fullName:identity.fullName,dateOfBirth:new Date(identity.dateOfBirth).toISOString().slice(0,10),attestedInNC:identity.attestedInNC,attestedAt:iso(identity.attestedAt),reviewedAt:iso(identity.reviewedAt),reviewedBy:identity.reviewedBy??null,patientMessage:identity.patientMessage??null}:null,eligibility:row.eligibility??null,medicalHistory:intake?.answers??{},questionnaireVersion:intake?.questionnaireVersion??settings.contentVersion,photoSet:set?await setDTO(tx,set):null,destination:row.destination??null,planId:member?.planId??row.planId??null,flags:row.flags??[],submittedAt:iso(row.submittedAt),approvedAt:iso(row.approvedAt),patientMessage:row.patientMessage??null},membership,consents});
 }
 async function setDTO(tx:any,set:any){return {id:set.id,purpose:set.purpose,status:set.status,requiredSlots:set.requiredSlots,items:(await tx.clinicalPhotoSetItem.findMany({where:{setId:set.id}})).map(({slot,photoId,captureId}:any)=>({slot,photoId,captureId}))}}
 const update=async(tx:any,row:any,data:any)=>tx.launchCase.update({where:{id:row.id},data:{...data,revision:row.revision+1}});
 const reply=async(tx:any,row:any,created:boolean)=>({response:await dto(tx,row),created});
 return {
  readDTO:dto,
  async get(patientId:string){return db.$transaction(async(tx:any)=>{await lock(tx,patientId);let row=await tx.launchCase.findUnique({where:{patientId}});if(!row){await publication(tx);row=await tx.launchCase.create({data:{patientId,revision:0,status:'consents',flags:[],createdAt:now()}})}return reply(tx,row,false)})},
  async consents(patientId:string,caseId:string,input:unknown,observedIp:string){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['PUT /enrollment/:caseId/consents'].request.parse(input),{docs}=await publication(tx);
   if(!isIP(observedIp))throw enrollmentError(400,'VALIDATION_ERROR');
   if(a.acceptances.some((v:any)=>!docs.some(d=>d.key===v.key&&d.version===v.version&&d.sha256===v.sha256)))throw enrollmentError(409,'CONSENT_OUTDATED');
   const receipts=await currentReceipts(tx,patientId,docs);if(receipts.every(d=>d.acceptedAt))return reply(tx,row,false);
   mutable(row);version(row,a.expectedRevision);
   for(const d of docs)if(!receipts.find(r=>r.key===d.key)?.acceptedAt)await tx.consentAcceptance.create({data:{userId:patientId,documentKey:d.key,documentVersion:d.version,documentSha256:d.sha256,versionLabel:d.versionLabel,observedIp,acceptedAt:now()}});
   row=await update(tx,row,{status:row.status==='consents'?'identity':row.status});return reply(tx,row,true);
  })},
  async identity(patientId:string,caseId:string,identityId:string,input:unknown){return uploadTransaction(patientId,async(tx:any,write)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));UUIDSchema.parse(identityId);const a=contracts['PUT /enrollment/:caseId/identity/:identityId'].request.parse(input),hash=launchFingerprint(a),existing=await tx.identityVerification.findUnique({where:{id:identityId}});
   if(existing){if(existing.patientId!==patientId||existing.caseId!==caseId)throw enrollmentError(404,'NOT_FOUND');if(existing.requestHash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');return reply(tx,row,false)}
   mutable(row);version(row,Number(a.expectedRevision));const {docs}=await publication(tx);if(!(await currentReceipts(tx,patientId,docs)).every(d=>d.acceptedAt)||!['identity','needs_changes'].includes(row.status))noStep();
   if(ageOn(a.dateOfBirth,now().toISOString().slice(0,10))<18||a.dateOfBirth>now().toISOString().slice(0,10)||a.physicallyInNC!=='true')throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
   const [idPhoto,selfie]=await Promise.all([sanitizeLaunchJPEG(a.idPhoto,'identity'),sanitizeLaunchJPEG(a.selfie,'identity')]);
   // Never reuse paths with uncertain cleanup; use a new attempt ID or verified operator cleanup.
   const {idPhotoPath,selfiePath}=identityObjectPaths(patientId,identityId);for(const path of [idPhotoPath,selfiePath]){const photoId=path.split('/')[1].slice(0,36),intent=await tx.photoCleanup.findUnique({where:{photoId}});if(intent)throw enrollmentError(409,'OPERATION_CONFLICT')}await write(idPhotoPath,idPhoto);await write(selfiePath,selfie);
   await tx.identityVerification.create({data:{id:identityId,caseId,patientId,idPhotoPath,selfiePath,fullName:a.fullName,dateOfBirth:new Date(a.dateOfBirth+'T00:00:00Z'),attestedInNC:true,attestedAt:now(),status:'uploaded',requestHash:hash}});
   row=await update(tx,row,{identityId,status:'eligibility'});return reply(tx,row,true);
  })},
  async eligibility(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['PUT /enrollment/:caseId/eligibility'].request.parse(input);
   if(row.status!=='eligibility'&&row.eligibility&&launchFingerprint(row.eligibility.answers)===launchFingerprint(a.answers))return reply(tx,row,false);
   mutable(row);version(row,a.expectedRevision);if(!['eligibility','needs_changes'].includes(row.status)||!row.identityId)noStep();
   const id=await tx.identityVerification.findUnique({where:{id:row.identityId}});if(!id||id.patientId!==patientId)noStep();const result=evaluateLaunchEligibility(a.answers,{dateOfBirth:new Date(id.dateOfBirth).toISOString().slice(0,10),attestedInNC:id.attestedInNC},now().toISOString().slice(0,10));
   const m=await tx.careMembership.findUnique({where:{patientId}}),covered=m&&['paid_pending_review','active','past_due'].includes(m.status)&&m.paidThrough&&new Date(m.paidThrough)>now();
   row=await update(tx,row,{eligibility:{answers:a.answers,...result},rulesVersion:result.rulesVersion,flags:result.flags,status:result.eligible?(covered?'medical_history':'payment'):'ineligible'});return reply(tx,row,true);
  })},
  async medical(patientId:string,caseId:string,revisionId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));UUIDSchema.parse(revisionId);const a=contracts['PUT /enrollment/:caseId/medical/:revisionId'].request.parse(input),answers=normalizeMedicalDraft(a.answers),hash=launchFingerprint({questionnaireVersion:a.questionnaireVersion,answers}),existing=await tx.intakeRevision.findUnique({where:{id:revisionId}});
   if(existing){if(existing.patientId!==patientId||existing.caseId!==caseId)throw enrollmentError(404,'NOT_FOUND');if(existing.requestHash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');return reply(tx,row,false)}
   await paid(tx,patientId);mutable(row);version(row,a.expectedRevision);if(!['payment','medical_history','photos','destination','needs_changes'].includes(row.status))noStep();
   const {settings}=await publication(tx);if(a.questionnaireVersion!==settings.contentVersion)throw enrollmentError(409,'CONSENT_OUTDATED');
   await tx.intakeRevision.create({data:{id:revisionId,caseId,patientId,questionnaireVersion:a.questionnaireVersion,answers,requestHash:hash,createdAt:now()}});
   let complete=false;try{completeMedicalHistory(answers);complete=true}catch{}
   row=await update(tx,row,{intakeId:revisionId,status:complete?'photos':'medical_history',flags:[...new Set([...(row.eligibility?.flags??[]),...launchFlags(answers)])]});return reply(tx,row,true);
  })},
  async destination(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['PUT /enrollment/:caseId/destination'].request.parse(input),m=await paid(tx,patientId);
   if(row.destination&&launchFingerprint(row.destination)===launchFingerprint(a.destination))return reply(tx,row,false);
   if(row.status!=='approved')mutable(row);version(row,a.expectedRevision);if(a.destination.planId!==m.planId)throw enrollmentError(409,'OPERATION_CONFLICT');if(!['photos','destination','needs_changes','approved'].includes(row.status))noStep();
   row=await update(tx,row,{destination:a.destination});await tx.careMembership.update({where:{id:m.id},data:{destinationRequired:false}});return reply(tx,row,true);
  })},
  async capture(patientId:string,captureId:string,input:unknown){return uploadTransaction(patientId,async(tx:any,write)=>{
   await lock(tx,patientId);UUIDSchema.parse(captureId);const a=contracts['POST /photo-captures/:captureId'].request.parse(input);await paid(tx,patientId);
   if(new Date(a.captureDate)>new Date(now().getTime()+5*60_000))throw enrollmentError(400,'VALIDATION_ERROR');
   if(a.targetType==='enrollment'){const row=await owned(tx,patientId,a.targetId);if(!['photos','destination','needs_changes'].includes(row.status))noStep()}
   else {const checkIn=await tx.launchCheckIn.findUnique({where:{id:a.targetId}});if(!checkIn||checkIn.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');const {membership}=await requirePatientCareScope(tx,patientId,'clinical_write',now());assertCurrentCheckIn(checkIn,membership);assertCheckInPhotoDate(checkIn,new Date(a.captureDate),now(),now());if(!['due','draft','needs_changes'].includes(checkIn.status))noStep()}
   const hash=launchFingerprint(a),identity=captureIdentity(patientId,captureId),existing=await tx.skinPhoto.findUnique({where:{id:identity.id}});
   if(existing){if(existing.userId!==patientId||existing.photoUrl!==identity.storagePath||iso(existing.captureDate)!==a.captureDate||existing.notes!==(a.notes??'')||existing.launchRequestHash!==hash||existing.launchTargetType!==a.targetType||existing.launchTargetId!==a.targetId)throw enrollmentError(409,'OPERATION_CONFLICT');return {capture:{id:existing.id,captureId,captureDate:iso(existing.captureDate),uploadedAt:iso(existing.createdAt)},created:false}}
   const pending=await tx.photoCleanup.findUnique({where:{photoId:identity.id}});if(pending)throw enrollmentError(409,'OPERATION_CONFLICT');const bytes=await sanitizeLaunchJPEG(a.photo,'skin');await write(identity.storagePath,bytes);
   const photo=await tx.skinPhoto.create({data:{id:identity.id,userId:patientId,photoUrl:identity.storagePath,launchTargetType:a.targetType,launchTargetId:a.targetId,launchRequestHash:hash,skinScore:0,notes:a.notes??'',captureDate:new Date(a.captureDate),createdAt:now()}});return {capture:{id:photo.id,captureId,captureDate:iso(photo.captureDate),uploadedAt:iso(photo.createdAt)},created:true};
  })},
  async photoSet(patientId:string,setId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);UUIDSchema.parse(setId);const a=contracts['PUT /photo-sets/:setId'].request.parse(input);await paid(tx,patientId);let row:any,checkIn:any;
   if(a.purpose==='enrollment'){row=await owned(tx,patientId,a.targetId);if(!['photos','destination','needs_changes'].includes(row.status))noStep()}
   else {checkIn=await tx.launchCheckIn.findUnique({where:{id:a.targetId}});if(!checkIn||checkIn.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');const {membership}=await requirePatientCareScope(tx,patientId,'clinical_write',now());assertCurrentCheckIn(checkIn,membership);if(!['due','draft','needs_changes'].includes(checkIn.status))noStep();row=await tx.launchCase.findUnique({where:{patientId}})}
   const existing=await tx.clinicalPhotoSet.findUnique({where:{id:setId}});if(existing&&(existing.patientId!==patientId||existing.purpose!==a.purpose||existing.caseId!==(a.purpose==='enrollment'?a.targetId:null)||existing.checkInId!==(a.purpose==='check_in'?a.targetId:null)))throw enrollmentError(404,'NOT_FOUND');
   const intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null,required=requiredClinicalSlots(intake?.answers??{});
   await validateClinicalPhotoItems(tx,patientId,setId,a.items,required,{purpose:a.purpose,id:a.targetId},false);
   if(existing){const old=await setDTO(tx,existing);if(launchFingerprint(old.items)===launchFingerprint(a.items)&&launchFingerprint(existing.requiredSlots)===launchFingerprint(required))return {photoSet:old,created:false};if(existing.status!=='draft')throw enrollmentError(409,'OPERATION_CONFLICT');await tx.clinicalPhotoSetItem.deleteMany({where:{setId}})}
   const set=existing?await tx.clinicalPhotoSet.update({where:{id:setId},data:{requiredSlots:required}}):await tx.clinicalPhotoSet.create({data:{id:setId,patientId,purpose:a.purpose,caseId:a.purpose==='enrollment'?a.targetId:null,checkInId:a.purpose==='check_in'?a.targetId:null,requiredSlots:required,status:'draft',createdAt:now()}});
   for(const item of a.items)await tx.clinicalPhotoSetItem.create({data:{setId,patientId,...item}});
   if(a.purpose==='enrollment')await tx.launchCase.update({where:{id:row.id},data:{photoSetId:setId,status:required.every(slot=>a.items.some((item:any)=>item.slot===slot))?'destination':'photos'}});else if(!checkIn.submittedAt)await tx.launchCheckIn.update({where:{id:checkIn.id},data:{photoSetId:setId,status:'draft'}});
   return {photoSet:await setDTO(tx,set),created:!existing};
  })},
  async submit(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['POST /enrollment/:caseId/submit'].request.parse(input);
   if(row.status==='submitted'&&row.photoSetId===a.photoSetId)return reply(tx,row,false);
   mutable(row);version(row,a.expectedRevision);const m=await paid(tx,patientId),{docs,settings}=await publication(tx);
   const id=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null,intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null;
   if(!id||id.patientId!==patientId||!id.attestedInNC||['rejected','needs_changes'].includes(id.status)||!row.eligibility?.eligible||!intake||intake.questionnaireVersion!==settings.contentVersion||!(await currentReceipts(tx,patientId,docs)).every(d=>d.acceptedAt))throw enrollmentError(409,'INCOMPLETE_CASE');
   let history:any,destination:any;try{history=completeMedicalHistory(intake.answers);destination=DestinationSchema.parse(row.destination)}catch{throw enrollmentError(409,'INCOMPLETE_CASE')};if(destination.planId!==m.planId)throw enrollmentError(409,'INCOMPLETE_CASE');
   const set=await tx.clinicalPhotoSet.findUnique({where:{id:a.photoSetId}});if(!set||set.patientId!==patientId||set.caseId!==caseId||!(set.status==='draft'||set.status==='submitted'&&row.submittedAt&&row.photoSetId===set.id))throw enrollmentError(409,'INCOMPLETE_PHOTO_SET');const items=(await setDTO(tx,set)).items;await validateClinicalPhotoItems(tx,patientId,set.id,items,requiredClinicalSlots(history),{purpose:'enrollment',id:caseId});
   const patient=await tx.user.findUnique({where:{id:patientId}});if(!patient.dermatologistId){if(!settings.clinicianId||!await tx.dermatologist.findUnique({where:{id:settings.clinicianId}}))throw enrollmentError(409,'INCOMPLETE_CASE');await tx.user.update({where:{id:patientId},data:{dermatologistId:settings.clinicianId}})}
   if(!intake.submittedAt)await tx.intakeRevision.update({where:{id:intake.id},data:{answers:history,submittedAt:now(),attestedAt:now()}});
   if(set.status==='draft')await tx.clinicalPhotoSet.update({where:{id:set.id},data:{status:'submitted',requiredSlots:requiredClinicalSlots(history)}});
   row=await update(tx,row,{status:'submitted',submittedAt:now(),photoSetId:set.id,planId:m.planId,settingsVersion:settings.version});
   const response=await dto(tx,row);
   await tx.launchCaseSubmission.create({data:{id:randomUUID(),caseId:row.id,patientId,caseRevision:row.revision,settingsVersion:settings.version,submittedAt:row.submittedAt,snapshot:{formatVersion:1,source:'submission',references:{identityId:row.identityId,intakeId:row.intakeId,photoSetId:row.photoSetId},case:response.case,consents:response.consents}}});
   return {response,created:true};
  })}
 };
}
// Storage credentials are loaded only by the normal runtime module on demand.
export const launchEnrollment=createLaunchEnrollment({db:prisma,store:async(path,bytes)=>{const {supabaseAdmin,PHOTO_BUCKET}=await import('../config/supabase');await storeLaunchJPEG(supabaseAdmin.storage.from(PHOTO_BUCKET),path,bytes)},remove:async path=>{const {supabaseAdmin,PHOTO_BUCKET}=await import('../config/supabase');const {error}=await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]);if(error)throw enrollmentError(503,'BILLING_UNAVAILABLE')}});
