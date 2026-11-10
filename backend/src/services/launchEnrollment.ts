import {queueRejectionRefund} from './billingLifecycle';
import {isEnrollment22,ProgressInputSchema,IdentityDraftInputSchema,IdentityIneligibleSchema,clinical22Complete} from './enrollmentFlow22';
import {careAccess,requirePatientCareScope} from './careAccess';
import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {prisma} from '../config/database';
import {contracts,UUIDSchema,EnrollmentResponseSchema,DestinationSchema} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
import {evaluateLaunchEligibility,ageOn} from './enrollmentRules';
import {normalizeMedicalDraft,completeMedicalHistory,launchFlags} from './launchEnrollmentValidation';
import {activeLaunchSettings,selectedLaunchSettings} from './launchSettings';
import {isIntakeV2,normalizeIntakeV2,evaluateIntakeV2,completeIntakeV2,intakeV2Projection} from './intakeV2';
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
export function createLaunchEnrollment(deps:{db:any;store:(path:string,bytes:Buffer)=>Promise<void>;remove:(path:string)=>Promise<void>;now?:()=>Date;sign?:(path:string,seconds:number)=>Promise<{url:string;expiresAt:string}>}){
 const {db,store}=deps,now=deps.now??(()=>new Date());
 const lock=async(tx:any,patientId:string)=>{await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${patientId}::uuid FOR UPDATE`;if(!await tx.user.findUnique({where:{id:patientId}}))throw enrollmentError(404,'NOT_FOUND')};
 async function uploadTransaction(patientId:string,job:(tx:any,write:(path:string,bytes:Buffer)=>Promise<void>)=>Promise<any>){
  const paths:string[]=[];
  try{return await db.$transaction((tx:any)=>job(tx,async(path,bytes)=>{paths.push(path);await store(path,bytes)}),{timeout:30000})}
  catch(error){
   // Serialize compensation against capture retries and never delete committed chart bytes.
   await db.$transaction(async(tx:any)=>{await lock(tx,patientId);for(const path of paths){
    const draft=await tx.launchCase.findUnique({where:{patientId}});if([draft?.enrollmentDraft?.identity?.idPhotoPath,draft?.enrollmentDraft?.identity?.selfiePath].includes(path))continue;const photo=await tx.skinPhoto.findFirst({where:{photoUrl:path}}),id=await tx.identityVerification.findFirst({where:{idPhotoPath:path}}),selfie=await tx.identityVerification.findFirst({where:{selfiePath:path}});
    if(photo||id||selfie)continue;
    const photoId=path.split('/')[1].slice(0,36);
    if(!await tx.photoCleanup.findUnique({where:{photoId}}))await tx.photoCleanup.create({data:{photoId,userId:patientId,photoUrl:path}});
   }});
   await db.$transaction(async(tx:any)=>{await lock(tx,patientId);for(const path of paths){const photoId=path.split('/')[1].slice(0,36),intent=await tx.photoCleanup.findUnique({where:{photoId}});if(intent&&intent.photoUrl===path){const draft=await tx.launchCase.findUnique({where:{patientId}});const committed=[draft?.enrollmentDraft?.identity?.idPhotoPath,draft?.enrollmentDraft?.identity?.selfiePath].includes(path)||await tx.skinPhoto.findFirst({where:{photoUrl:path}})||await tx.identityVerification.findFirst({where:{idPhotoPath:path}})||await tx.identityVerification.findFirst({where:{selfiePath:path}});if(!committed)await deps.remove(path);await tx.photoCleanup.deleteMany({where:{photoId,userId:patientId}})}}});
   throw error;
  }
 }
 const owned=async(tx:any,patientId:string,id:string)=>{const row=await tx.launchCase.findUnique({where:{id}});if(!row||row.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');return row};
 const version=(row:any,expected:number)=>{if(row.revision!==expected)throw enrollmentError(409,'REVISION_CONFLICT')};
 const mutable=(row:any)=>{if(['submitted','approved','rejected','ineligible'].includes(row.status))noStep()};
 const paid=async(tx:any,patientId:string)=>{const m=await tx.careMembership.findUnique({where:{patientId}});if(!m||!['paid_pending_review','active','past_due'].includes(m.status))throw enrollmentError(403,'CARE_ACCESS_REQUIRED');if(!m.paidThrough||new Date(m.paidThrough)<=now())throw enrollmentError(403,'CARE_ACCESS_REQUIRED');return m};
 async function prepaymentOrCovered(tx:any,patientId:string,row:any){const m=await tx.careMembership.findUnique({where:{patientId}});if(row.submittedAt||m?.paidThrough)await paid(tx,patientId);return m}
 async function publication(tx:any,settingsVersion?:number){
  const settings=settingsVersion===undefined?await activeLaunchSettings(tx):await tx.launchSettings.findUnique({where:{version:settingsVersion}});if(!settings)throw enrollmentError(503,'BILLING_UNAVAILABLE');try{const docs=validateLaunchDocuments((settings.content as any)?.consents);return {settings,docs}}catch{throw enrollmentError(503,'BILLING_UNAVAILABLE')}
 }
 async function casePublication(tx:any,row:any){
  if(row.settingsVersion){const pinned=await tx.launchSettings.findUnique({where:{version:row.settingsVersion}});if(['submitted','approved','rejected'].includes(row.status)||isIntakeV2(pinned?.contentVersion))return publication(tx,row.settingsVersion)}
  const selected=await selectedLaunchSettings(tx);return publication(tx,selected.version);
 }
 async function currentReceipts(tx:any,patientId:string,docs:any[]){
  const receipts=await tx.consentAcceptance.findMany({where:{userId:patientId}});
  return docs.map(d=>({...d,acceptedAt:iso(receipts.find((r:any)=>r.documentKey===d.key&&r.documentVersion===d.version&&r.documentSha256===d.sha256)?.acceptedAt)}));
 }
 async function dto(tx:any,row:any){
  const frozen=['submitted','approved','rejected'].includes(row.status);if(frozen&&!row.settingsVersion)throw enrollmentError(503,'BILLING_UNAVAILABLE');
  const {settings,docs}=await casePublication(tx,row),consents=await currentReceipts(tx,row.patientId,docs);
  const identity=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null;
  const intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null;
  const set=row.photoSetId?await tx.clinicalPhotoSet.findUnique({where:{id:row.photoSetId}}):null;
  const member=await tx.careMembership.findUnique({where:{patientId:row.patientId}});
  const membership=member?{id:member.id,planId:member.planId,status:member.status,amountCents:member.amountCents,currency:member.currency,activatedAt:iso(member.activatedAt),currentPeriodEnd:iso(member.currentPeriodEnd),paidThrough:iso(member.paidThrough),cancelAtPeriodEnd:member.cancelAtPeriodEnd??false,cadenceAnchor:iso(member.cadenceAnchor),destinationRequired:member.destinationRequired??false,refundStatus:member.refundStatus??'not_applicable',access:careAccess(row,member,now())??'enrollment'}:null;
  const flow22=isEnrollment22(settings.contentVersion),draft=row.enrollmentDraft??{},step=['eligibility','consents','payment','identity','medical_history','photos','destination'].includes(row.status)?row.status:row.status==='needs_changes'?(identity?.status==='needs_changes'?'identity':['medical_history','destination','photos'].includes(draft.progress?.step)?draft.progress.step:'medical_history'):null;
  const progress:any=flow22&&step?{step,topicId:draft.progress?.step===step?draft.progress.topicId??null:null,...(draft.progress?.eligibilityDraft?{eligibilityDraft:draft.progress.eligibilityDraft}:{}),...(draft.progress?.consentDraft?{consentDraft:draft.progress.consentDraft}:{}),...(draft.progress?.destinationDraft?{destinationDraft:draft.progress.destinationDraft}:{}),...(draft.progress?.selectedPlan?{selectedPlan:draft.progress.selectedPlan}:{})}:null;
  if(progress&&draft.identity&&(!identity||identity.status==='needs_changes')){const d=draft.identity,sign=async(path:string|undefined)=>path&&deps.sign?deps.sign(path,300):null;progress.identityDraft={fullName:d.fullName,dateOfBirth:d.dateOfBirth,physicallyInNC:d.physicallyInNC,idPhoto:await sign(d.idPhotoPath),selfie:await sign(d.selfiePath)}}
  return EnrollmentResponseSchema.parse({case:{id:row.id,revision:row.revision,status:row.status,...(progress?{enrollmentProgress:progress}:{}),identity:identity?{id:identity.id,status:identity.status,fullName:identity.fullName,dateOfBirth:new Date(identity.dateOfBirth).toISOString().slice(0,10),attestedInNC:identity.attestedInNC,attestedAt:iso(identity.attestedAt),reviewedAt:iso(identity.reviewedAt),reviewedBy:identity.reviewedBy??null,patientMessage:identity.patientMessage??null}:null,eligibility:row.eligibility?{answers:row.eligibility.answers,eligible:row.eligibility.eligible,reasons:row.eligibility.reasons,flags:row.eligibility.flags,rulesVersion:row.eligibility.rulesVersion}:null,medicalHistory:isIntakeV2(intake?.questionnaireVersion??settings.contentVersion)?{}:intake?.answers??{},questionnaireVersion:intake?.questionnaireVersion??settings.contentVersion,...(isIntakeV2(intake?.questionnaireVersion??settings.contentVersion)?{intakeV2:intakeV2Projection(isEnrollment22(settings.contentVersion)&&identity?{A3:row.eligibility?.answers?.E1,A5:row.eligibility?.answers?.E3,...(intake?.answers??{}),A1:new Date(identity.dateOfBirth).toISOString().slice(0,10),A2:'yes',A7:true,...(member?{planId:member.planId}:{})}:intake?.answers??{},row.eligibility??{},now().toISOString().slice(0,10))}:{}),photoSet:set?await setDTO(tx,set):null,destination:row.destination??null,planId:member?.planId??row.planId??null,flags:row.flags??[],submittedAt:iso(row.submittedAt),approvedAt:iso(row.approvedAt),patientMessage:row.patientMessage??null},membership,consents});
 }
 async function setDTO(tx:any,set:any){return {id:set.id,purpose:set.purpose,status:set.status,requiredSlots:set.requiredSlots,items:(await tx.clinicalPhotoSetItem.findMany({where:{setId:set.id}})).map(({slot,photoId,captureId}:any)=>({slot,photoId,captureId}))}}
 const update=async(tx:any,row:any,data:any)=>tx.launchCase.update({where:{id:row.id},data:{...data,revision:row.revision+1}});
 const reply=async(tx:any,row:any,created:boolean)=>({response:await dto(tx,row),created});
 return {
  readDTO:dto,
  async get(patientId:string,questionnaireVersion?:string){return db.$transaction(async(tx:any)=>{await lock(tx,patientId);let row=await tx.launchCase.findUnique({where:{patientId}});if(!row){const selected=await selectedLaunchSettings(tx,questionnaireVersion);await publication(tx,selected.version);row=await tx.launchCase.create({data:{patientId,revision:0,status:isEnrollment22(selected.contentVersion)?'eligibility':'consents',settingsVersion:selected.version,flags:[],createdAt:now()}})}else if(isIntakeV2(questionnaireVersion)&&!row.settingsVersion&&row.revision===0&&row.status==='consents'&&!row.identityId&&!row.intakeId&&!row.eligibility&&!row.photoSetId&&!row.destination&&!row.planId&&!row.submittedAt&&!await tx.careMembership.findUnique({where:{patientId}})&&!await tx.consentAcceptance.findFirst({where:{userId:patientId}})){const selected=await selectedLaunchSettings(tx,questionnaireVersion);await publication(tx,selected.version);row=await tx.launchCase.update({where:{id:row.id},data:{settingsVersion:selected.version,...(isEnrollment22(selected.contentVersion)?{status:'eligibility'}:{})}})}return reply(tx,row,false)})},
  async consents(patientId:string,caseId:string,input:unknown,observedIp:string){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['PUT /enrollment/:caseId/consents'].request.parse(input),{docs,settings}=await casePublication(tx,row);
   if(!isIP(observedIp))throw enrollmentError(400,'VALIDATION_ERROR');
   if(a.acceptances.some((v:any)=>!docs.some(d=>d.key===v.key&&d.version===v.version&&d.sha256===v.sha256)))throw enrollmentError(409,'CONSENT_OUTDATED');
   const receipts=await currentReceipts(tx,patientId,docs);if(receipts.every(d=>d.acceptedAt))return reply(tx,row,false);
   mutable(row);version(row,a.expectedRevision);if(isEnrollment22(settings.contentVersion)&&row.status==='eligibility')noStep();
   for(const d of docs)if(!receipts.find(r=>r.key===d.key)?.acceptedAt)await tx.consentAcceptance.create({data:{userId:patientId,documentKey:d.key,documentVersion:d.version,documentSha256:d.sha256,versionLabel:d.versionLabel,observedIp,acceptedAt:now()}});
   row=await update(tx,row,{status:row.status==='consents'?(isEnrollment22(settings.contentVersion)?'payment':'identity'):row.status});return reply(tx,row,true);
  })},
  async progress(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=ProgressInputSchema.parse(input),{settings,docs}=await casePublication(tx,row);if(!isEnrollment22(settings.contentVersion))noStep();mutable(row);
   const expectedStep=row.status==='needs_changes'?(row.identityId&&(await tx.identityVerification.findUnique({where:{id:row.identityId}}))?.status==='needs_changes'?'identity':'medical_history'):row.status;if(a.step!==expectedStep&&!(row.status==='needs_changes'&&expectedStep==='medical_history'&&['medical_history','photos','destination'].includes(a.step)))noStep();
   if(a.topicId!==null&&(a.step==='eligibility'?a.topicId!=='quick_eligibility':a.step!=='medical_history'||!(settings.content as any)?.enrollmentFlow?.medicalSections?.some((section:any)=>section.id===a.topicId)))noStep();
   if(a.consentDraft?.some(d=>!docs.some(v=>v.key===d.key&&v.version===d.version&&v.sha256===d.sha256)))throw enrollmentError(409,'CONSENT_OUTDATED');
   const {expectedRevision,...changes}=a,draft=row.enrollmentDraft??{},progress={...(draft.progress??{}),...changes};if(launchFingerprint(draft.progress??null)===launchFingerprint(progress))return reply(tx,row,false);version(row,expectedRevision);row=await update(tx,row,{enrollmentDraft:{...draft,progress}});return reply(tx,row,true);
  })},
  async identityIneligible(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=IdentityIneligibleSchema.parse(input),{settings}=await casePublication(tx,row);if(!isEnrollment22(settings.contentVersion))noStep();
   if(row.status==='rejected'&&row.enrollmentDraft?.identityStopReason===a.reason)return reply(tx,row,false);mutable(row);version(row,a.expectedRevision);
   if(row.status!=='identity'&&!(row.status==='needs_changes'&&row.identityId&&(await tx.identityVerification.findUnique({where:{id:row.identityId}}))?.status==='needs_changes'))noStep();
   const m=await paid(tx,patientId);await queueRejectionRefund(tx,{membership:m,now:now()});row=await update(tx,row,{status:'rejected',enrollmentDraft:{...(row.enrollmentDraft??{}),identityStopReason:a.reason},patientMessage:'UNZIT is for adults 18 and older who are physically in North Carolina. Your payment will be refunded in full.'});return reply(tx,row,true);
  })},
  async identityDraft(patientId:string,caseId:string,attemptId:string,input:unknown){return uploadTransaction(patientId,async(tx:any,write)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));UUIDSchema.parse(attemptId);const a=IdentityDraftInputSchema.parse(input),{settings}=await casePublication(tx,row);if(!isEnrollment22(settings.contentVersion))noStep();mutable(row);await paid(tx,patientId);if(!['identity','needs_changes'].includes(row.status))noStep();
   const draft=row.enrollmentDraft??{},hash=launchFingerprint(a);if(draft.identityOperation?.id===attemptId){if(draft.identityOperation.hash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');return reply(tx,row,false)}version(row,Number(a.expectedRevision));
   if(await tx.identityVerification.findUnique({where:{id:attemptId}}))throw enrollmentError(409,'OPERATION_CONFLICT');const paths=identityObjectPaths(patientId,attemptId),identity={...(draft.identity??{}),fullName:a.fullName,dateOfBirth:a.dateOfBirth||null,physicallyInNC:a.physicallyInNC==='true'};
   for(const key of ['idPhoto','selfie'] as const)if(a[key]){const path=paths[key==='idPhoto'?'idPhotoPath':'selfiePath'],photoId=path.split('/')[1].slice(0,36);if(await tx.photoCleanup.findUnique({where:{photoId}}))throw enrollmentError(409,'OPERATION_CONFLICT');await write(path,await sanitizeLaunchJPEG(a[key]!,'identity'));identity[key==='idPhoto'?'idPhotoPath':'selfiePath']=path}
   row=await update(tx,row,{enrollmentDraft:{...draft,identity,identityOperation:{id:attemptId,hash}}});return reply(tx,row,true);
  })},
  async identity(patientId:string,caseId:string,identityId:string,input:unknown){return uploadTransaction(patientId,async(tx:any,write)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));UUIDSchema.parse(identityId);const a=contracts['PUT /enrollment/:caseId/identity/:identityId'].request.parse(input),hash=launchFingerprint(a),existing=await tx.identityVerification.findUnique({where:{id:identityId}});
   if(existing){if(existing.patientId!==patientId||existing.caseId!==caseId)throw enrollmentError(404,'NOT_FOUND');if(existing.requestHash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');return reply(tx,row,false)}
   mutable(row);version(row,Number(a.expectedRevision));const {docs,settings}=await casePublication(tx,row);if(!(await currentReceipts(tx,patientId,docs)).every(d=>d.acceptedAt)||(!isIntakeV2(settings.contentVersion)&&!['identity','needs_changes'].includes(row.status)))noStep();
   if(isEnrollment22(settings.contentVersion)){await paid(tx,patientId);if(!['identity','needs_changes'].includes(row.status)||!row.eligibility?.eligible)noStep()}
   else if(isIntakeV2(settings.contentVersion)){const prior=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null,e=evaluateIntakeV2(prior?.answers??{},now().toISOString().slice(0,10));if(e.exitPage||['W1','A1','A2','A3','A4','A5','A6','A6choice','A6b'].some(k=>e.missingRequired.includes(k)))noStep();if(prior?.answers?.A1!==a.dateOfBirth)throw enrollmentError(409,'OPERATION_CONFLICT')}
   if(ageOn(a.dateOfBirth,now().toISOString().slice(0,10))<18||a.dateOfBirth>now().toISOString().slice(0,10)||a.physicallyInNC!=='true'){
    if(!isEnrollment22(settings.contentVersion))noStep();const m=await paid(tx,patientId);await queueRejectionRefund(tx,{membership:m,now:now()});row=await update(tx,row,{status:'rejected',patientMessage:'UNZIT is for adults 18 and older who are physically in North Carolina. Your payment will be refunded in full.'});return reply(tx,row,true);
   }
   const [idPhoto,selfie]=await Promise.all([sanitizeLaunchJPEG(a.idPhoto,'identity'),sanitizeLaunchJPEG(a.selfie,'identity')]);
   // Never reuse paths with uncertain cleanup; use a new attempt ID or verified operator cleanup.
   const {idPhotoPath,selfiePath}=identityObjectPaths(patientId,identityId);for(const path of [idPhotoPath,selfiePath]){const photoId=path.split('/')[1].slice(0,36),intent=await tx.photoCleanup.findUnique({where:{photoId}});if(intent)throw enrollmentError(409,'OPERATION_CONFLICT')}await write(idPhotoPath,idPhoto);await write(selfiePath,selfie);
   await tx.identityVerification.create({data:{id:identityId,caseId,patientId,idPhotoPath,selfiePath,fullName:a.fullName,dateOfBirth:new Date(a.dateOfBirth+'T00:00:00Z'),attestedInNC:true,attestedAt:now(),status:'uploaded',requestHash:hash}});
   if(isEnrollment22(settings.contentVersion)){const patient=await tx.user.findUnique({where:{id:patientId}});if(!patient.dermatologistId&&settings.clinicianId)await tx.user.update({where:{id:patientId},data:{dermatologistId:settings.clinicianId}})}
   row=await update(tx,row,{identityId,...(isEnrollment22(settings.contentVersion)?{enrollmentDraft:{...(row.enrollmentDraft??{}),identity:null,identityOperation:null}}:{}),status:isIntakeV2(settings.contentVersion)?'medical_history':'eligibility'});return reply(tx,row,true);
  })},
  async eligibility(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['PUT /enrollment/:caseId/eligibility'].request.parse(input);
   if(row.status!=='eligibility'&&row.eligibility&&launchFingerprint(row.eligibility.answers)===launchFingerprint(a.answers))return reply(tx,row,false);
   mutable(row);version(row,a.expectedRevision);const {settings}=await casePublication(tx,row);
   if(isEnrollment22(settings.contentVersion)){
    if(row.status!=='eligibility')noStep();const reasons:string[]=[],flags:string[]=[];if(a.answers.E1==='something_else')reasons.push('condition');if(a.answers.E2==='yes')reasons.push('red_flags');if(['pregnant','breastfeeding'].includes(a.answers.E3))flags.push('pregnancy_safe_review');if(a.answers.E4==='yes')flags.push('overlapping_treatment');
    row=await update(tx,row,{eligibility:{answers:a.answers,eligible:!reasons.length,reasons,flags,rulesVersion:settings.contentVersion},rulesVersion:settings.contentVersion,flags,status:reasons.length?'ineligible':'consents'});return reply(tx,row,true);
   }
   if(!['eligibility','needs_changes'].includes(row.status)||!row.identityId)noStep();
   const id=await tx.identityVerification.findUnique({where:{id:row.identityId}});if(!id||id.patientId!==patientId)noStep();const result=evaluateLaunchEligibility(a.answers,{dateOfBirth:new Date(id.dateOfBirth).toISOString().slice(0,10),attestedInNC:id.attestedInNC},now().toISOString().slice(0,10));
   const m=await tx.careMembership.findUnique({where:{patientId}}),covered=m&&['paid_pending_review','active','past_due'].includes(m.status)&&m.paidThrough&&new Date(m.paidThrough)>now();
   row=await update(tx,row,{eligibility:{answers:a.answers,...result},rulesVersion:result.rulesVersion,flags:result.flags,status:result.eligible?(covered?'medical_history':'payment'):'ineligible'});return reply(tx,row,true);
  })},
  async medical(patientId:string,caseId:string,revisionId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));UUIDSchema.parse(revisionId);const a=contracts['PUT /enrollment/:caseId/medical/:revisionId'].request.parse(input),rawAnswers=isIntakeV2(a.questionnaireVersion)?normalizeIntakeV2(a.answers):normalizeMedicalDraft(a.answers),hash=launchFingerprint({questionnaireVersion:a.questionnaireVersion,answers:rawAnswers,...(a.advance===undefined?{}:{advance:a.advance})}),existing=await tx.intakeRevision.findUnique({where:{id:revisionId}});
   if(existing){if(existing.patientId!==patientId||existing.caseId!==caseId)throw enrollmentError(404,'NOT_FOUND');if(existing.requestHash!==hash)throw enrollmentError(409,'OPERATION_CONFLICT');return reply(tx,row,false)}
   mutable(row);version(row,a.expectedRevision);const {settings}=await casePublication(tx,row);if(a.questionnaireVersion!==settings.contentVersion)throw enrollmentError(409,'CONSENT_OUTDATED');
   let answers=rawAnswers;
   if(isEnrollment22(a.questionnaireVersion)){await paid(tx,patientId);const id=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null;if(!id||id.patientId!==patientId||['rejected','needs_changes'].includes(id.status)||!['medical_history','photos','destination','needs_changes'].includes(row.status))noStep();const member=await tx.careMembership.findUnique({where:{patientId}});if((answers as any).planId&&(answers as any).planId!==member.planId)throw enrollmentError(409,'OPERATION_CONFLICT');const defaults={A1:new Date(id.dateOfBirth).toISOString().slice(0,10),A2:'yes',A7:true,planId:member.planId};if((answers as any).A1&&(answers as any).A1!==defaults.A1)throw enrollmentError(409,'OPERATION_CONFLICT');answers=normalizeIntakeV2({A3:row.eligibility?.answers?.E1,A5:row.eligibility?.answers?.E3,...answers,...defaults})}
   if(isIntakeV2(a.questionnaireVersion)){
    const membership=await prepaymentOrCovered(tx,patientId,row),covered=!!membership&&['paid_pending_review','active','past_due'].includes(membership.status)&&membership.paidThrough&&new Date(membership.paidThrough)>now();
    const prior=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null,unchanged=!!prior&&prior.questionnaireVersion===a.questionnaireVersion&&launchFingerprint(prior.answers)===launchFingerprint(answers);
    const evaluation=evaluateIntakeV2(answers,now().toISOString().slice(0,10));
    await tx.intakeRevision.create({data:{id:revisionId,caseId,patientId,questionnaireVersion:a.questionnaireVersion,answers,requestHash:hash,createdAt:now()}});
    let next22='medical_history';if(isEnrollment22(a.questionnaireVersion)&&clinical22Complete(evaluation)){
     next22=a.advance===false&&row.status==='medical_history'?'medical_history':row.status==='needs_changes'?'needs_changes':'photos';
     if(next22==='photos'&&a.advance!==false&&(answers as any).F2===true&&row.photoSetId){const set=await tx.clinicalPhotoSet.findUnique({where:{id:row.photoSetId}});if(set){const items=(await setDTO(tx,set)).items;if(requiredClinicalSlots(answers).every(slot=>items.some((item:any)=>item.slot===slot)))next22='destination'}}
    }
    const legacy=isEnrollment22(a.questionnaireVersion)?row.eligibility.answers:{E1:(answers as any).A3??'acne',E2:(answers as any).A2??'no',E3:(answers as any).A5??'neither',E4:'no'};if(isEnrollment22(a.questionnaireVersion))evaluation.flags=[...new Set([...(row.eligibility?.flags??[]).filter((f:string)=>['pregnancy_safe_review','overlapping_treatment'].includes(f)),...evaluation.flags])];
    row=await update(tx,row,{intakeId:revisionId,planId:(answers as any).planId??row.planId,eligibility:{answers:legacy,eligible:!evaluation.exitPage,reasons:evaluation.exitPage?[evaluation.exitPage]:[],flags:evaluation.flags,rulesVersion:a.questionnaireVersion,...(unchanged&&row.eligibility?.holdDecision?{holdDecision:row.eligibility.holdDecision}:{}),...(unchanged&&row.eligibility?.screeningDecisions?{screeningDecisions:row.eligibility.screeningDecisions}:{})},rulesVersion:a.questionnaireVersion,settingsVersion:settings.version,patientMessage:evaluation.exitPage?(settings.content as any)?.intakeV2?.exitPages?.[evaluation.exitPage]??'You have not been charged.':row.patientMessage,status:isEnrollment22(a.questionnaireVersion)?(evaluation.exitPage?'ineligible':next22):evaluation.exitPage?'ineligible':evaluation.missingRequired.length===0&&row.identityId?(covered?'medical_history':'payment'):row.identityId?'medical_history':'consents',flags:evaluation.flags});
    if(isEnrollment22(a.questionnaireVersion)&&evaluation.exitPage){await queueRejectionRefund(tx,{membership:membership!,now:now()})}
    if(evaluation.exitPage==='A'){const patient=await tx.user.findUnique({where:{id:patientId}});if(!patient.dermatologistId&&settings.clinicianId)await tx.user.update({where:{id:patientId},data:{dermatologistId:settings.clinicianId}})}
    return reply(tx,row,true);
   }
   await paid(tx,patientId);if(!['payment','medical_history','photos','destination','needs_changes'].includes(row.status))noStep();
   await tx.intakeRevision.create({data:{id:revisionId,caseId,patientId,questionnaireVersion:a.questionnaireVersion,answers,requestHash:hash,createdAt:now()}});
   let complete=false;try{completeMedicalHistory(answers);complete=true}catch{}
   row=await update(tx,row,{intakeId:revisionId,status:complete?'photos':'medical_history',flags:[...new Set([...(row.eligibility?.flags??[]),...launchFlags(answers)])]});return reply(tx,row,true);
  })},
  async destination(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['PUT /enrollment/:caseId/destination'].request.parse(input),{settings}=await casePublication(tx,row),v2=isIntakeV2(settings.contentVersion),m=v2?await tx.careMembership.findUnique({where:{patientId}}):await paid(tx,patientId);
   if(row.destination&&launchFingerprint(row.destination)===launchFingerprint(a.destination)){
    if(isEnrollment22(settings.contentVersion)&&row.enrollmentDraft?.progress?.destinationDraft){if(row.status!=='approved')mutable(row);version(row,a.expectedRevision);const progress={...row.enrollmentDraft.progress};delete progress.destinationDraft;row=await update(tx,row,{enrollmentDraft:{...row.enrollmentDraft,progress}});return reply(tx,row,true)}
    return reply(tx,row,false);
   }
   if(row.status!=='approved')mutable(row);version(row,a.expectedRevision);if(a.destination.planId!==(m?.planId??row.planId))throw enrollmentError(409,'OPERATION_CONFLICT');if(!(v2?['consents','identity','medical_history','payment','photos','destination','needs_changes','approved']:['photos','destination','needs_changes','approved']).includes(row.status))noStep();
   let intakeId=row.intakeId;const progress={...(row.enrollmentDraft?.progress??{}),step:'destination',topicId:null};delete progress.destinationDraft;
   if(isEnrollment22(settings.contentVersion)){
    await paid(tx,patientId);if(!row.identityId||!['destination','needs_changes','approved'].includes(row.status))noStep();const prior=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null;if(!prior)noStep();
    const answers=normalizeIntakeV2({...prior.answers,...(a.destination.planId==='care'?{G1:[a.destination.pharmacy.name,a.destination.pharmacy.city].join(', ')}:{G2:'yes'})});intakeId=randomUUID();await tx.intakeRevision.create({data:{id:intakeId,caseId,patientId,questionnaireVersion:settings.contentVersion,answers,requestHash:launchFingerprint({questionnaireVersion:settings.contentVersion,answers}),createdAt:now()}});
   }
   row=await update(tx,row,{destination:a.destination,...(isEnrollment22(settings.contentVersion)?{intakeId,enrollmentDraft:{...(row.enrollmentDraft??{}),progress}}:{})});if(m)await tx.careMembership.update({where:{id:m.id},data:{destinationRequired:false}});return reply(tx,row,true);
  })},
  async capture(patientId:string,captureId:string,input:unknown){return uploadTransaction(patientId,async(tx:any,write)=>{
   await lock(tx,patientId);UUIDSchema.parse(captureId);const a=contracts['POST /photo-captures/:captureId'].request.parse(input);if(a.targetType!=='enrollment')await paid(tx,patientId);
   if(new Date(a.captureDate)>new Date(now().getTime()+5*60_000))throw enrollmentError(400,'VALIDATION_ERROR');
   if(a.targetType==='enrollment'){const row=await owned(tx,patientId,a.targetId),{settings}=await casePublication(tx,row);if(!isIntakeV2(settings.contentVersion))await paid(tx,patientId);else if(isEnrollment22(settings.contentVersion)){await paid(tx,patientId);if(!row.identityId||!['photos','destination','needs_changes'].includes(row.status))noStep()}else await prepaymentOrCovered(tx,patientId,row);if(!(isIntakeV2(settings.contentVersion)?['medical_history','payment','photos','destination','needs_changes']:['photos','destination','needs_changes']).includes(row.status))noStep()}
   else {const checkIn=await tx.launchCheckIn.findUnique({where:{id:a.targetId}});if(!checkIn||checkIn.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');const {membership}=await requirePatientCareScope(tx,patientId,'clinical_write',now());assertCurrentCheckIn(checkIn,membership);assertCheckInPhotoDate(checkIn,new Date(a.captureDate),now(),now());if(!['due','draft','needs_changes'].includes(checkIn.status))noStep()}
   const hash=launchFingerprint(a),identity=captureIdentity(patientId,captureId),existing=await tx.skinPhoto.findUnique({where:{id:identity.id}});
   if(existing){if(existing.userId!==patientId||existing.photoUrl!==identity.storagePath||iso(existing.captureDate)!==a.captureDate||existing.notes!==(a.notes??'')||existing.launchRequestHash!==hash||existing.launchTargetType!==a.targetType||existing.launchTargetId!==a.targetId)throw enrollmentError(409,'OPERATION_CONFLICT');return {capture:{id:existing.id,captureId,captureDate:iso(existing.captureDate),uploadedAt:iso(existing.createdAt)},created:false}}
   const pending=await tx.photoCleanup.findUnique({where:{photoId:identity.id}});if(pending)throw enrollmentError(409,'OPERATION_CONFLICT');const bytes=await sanitizeLaunchJPEG(a.photo,'skin');await write(identity.storagePath,bytes);
   const photo=await tx.skinPhoto.create({data:{id:identity.id,userId:patientId,photoUrl:identity.storagePath,launchTargetType:a.targetType,launchTargetId:a.targetId,launchRequestHash:hash,skinScore:0,notes:a.notes??'',captureDate:new Date(a.captureDate),createdAt:now()}});return {capture:{id:photo.id,captureId,captureDate:iso(photo.captureDate),uploadedAt:iso(photo.createdAt)},created:true};
  })},
  async photoSet(patientId:string,setId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);UUIDSchema.parse(setId);const a=contracts['PUT /photo-sets/:setId'].request.parse(input);if(a.purpose!=='enrollment')await paid(tx,patientId);let row:any,checkIn:any,flow22=false;
   if(a.purpose==='enrollment'){row=await owned(tx,patientId,a.targetId);const {settings}=await casePublication(tx,row);flow22=isEnrollment22(settings.contentVersion);if(!isIntakeV2(settings.contentVersion))await paid(tx,patientId);else if(isEnrollment22(settings.contentVersion)){await paid(tx,patientId);if(!row.identityId||!['photos','destination','needs_changes'].includes(row.status))noStep()}else await prepaymentOrCovered(tx,patientId,row);if(!(isIntakeV2(settings.contentVersion)?['medical_history','payment','photos','destination','needs_changes']:['photos','destination','needs_changes']).includes(row.status))noStep()}
   else {checkIn=await tx.launchCheckIn.findUnique({where:{id:a.targetId}});if(!checkIn||checkIn.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');const {membership}=await requirePatientCareScope(tx,patientId,'clinical_write',now());assertCurrentCheckIn(checkIn,membership);if(!['due','draft','needs_changes'].includes(checkIn.status))noStep();row=await tx.launchCase.findUnique({where:{patientId}})}
   const existing=await tx.clinicalPhotoSet.findUnique({where:{id:setId}});if(existing&&(existing.patientId!==patientId||existing.purpose!==a.purpose||existing.caseId!==(a.purpose==='enrollment'?a.targetId:null)||existing.checkInId!==(a.purpose==='check_in'?a.targetId:null)))throw enrollmentError(404,'NOT_FOUND');
   const intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null,required=requiredClinicalSlots(intake?.answers??{});
   await validateClinicalPhotoItems(tx,patientId,setId,a.items,required,{purpose:a.purpose,id:a.targetId},false);
   if(existing){const old=await setDTO(tx,existing);if(launchFingerprint(old.items)===launchFingerprint(a.items)&&launchFingerprint(existing.requiredSlots)===launchFingerprint(required))return {photoSet:old,created:false};if(existing.status!=='draft')throw enrollmentError(409,'OPERATION_CONFLICT');await tx.clinicalPhotoSetItem.deleteMany({where:{setId}})}
   const set=existing?await tx.clinicalPhotoSet.update({where:{id:setId},data:{requiredSlots:required}}):await tx.clinicalPhotoSet.create({data:{id:setId,patientId,purpose:a.purpose,caseId:a.purpose==='enrollment'?a.targetId:null,checkInId:a.purpose==='check_in'?a.targetId:null,requiredSlots:required,status:'draft',createdAt:now()}});
   for(const item of a.items)await tx.clinicalPhotoSetItem.create({data:{setId,patientId,...item}});
   if(a.purpose==='enrollment')await tx.launchCase.update({where:{id:row.id},data:{photoSetId:setId,status:flow22?'photos':required.every(slot=>a.items.some((item:any)=>item.slot===slot))?'destination':'photos'}});else if(!checkIn.submittedAt)await tx.launchCheckIn.update({where:{id:checkIn.id},data:{photoSetId:setId,status:'draft'}});
   return {photoSet:await setDTO(tx,set),created:!existing};
  })},
  async submit(patientId:string,caseId:string,input:unknown){return db.$transaction(async(tx:any)=>{
   await lock(tx,patientId);let row=await owned(tx,patientId,UUIDSchema.parse(caseId));const a=contracts['POST /enrollment/:caseId/submit'].request.parse(input);
   if(row.status==='submitted'&&row.photoSetId===a.photoSetId)return reply(tx,row,false);
   mutable(row);version(row,a.expectedRevision);const m=await paid(tx,patientId),{docs,settings}=await casePublication(tx,row);
   const id=row.identityId?await tx.identityVerification.findUnique({where:{id:row.identityId}}):null,intake=row.intakeId?await tx.intakeRevision.findUnique({where:{id:row.intakeId}}):null;
   if(!id||id.patientId!==patientId||!id.attestedInNC||['rejected','needs_changes'].includes(id.status)||!row.eligibility?.eligible||!intake||intake.questionnaireVersion!==settings.contentVersion||!(await currentReceipts(tx,patientId,docs)).every(d=>d.acceptedAt))throw enrollmentError(409,'INCOMPLETE_CASE');
   let history:any,destination:any;try{history=isIntakeV2(intake.questionnaireVersion)?completeIntakeV2(intake.answers,now().toISOString().slice(0,10)):completeMedicalHistory(intake.answers);if(isIntakeV2(intake.questionnaireVersion)&&(history.planId!==m.planId||history.A1!==new Date(id.dateOfBirth).toISOString().slice(0,10)))throw Error();destination=isIntakeV2(intake.questionnaireVersion)&&!isEnrollment22(intake.questionnaireVersion)&&m.planId==='care'&&!row.destination?{planId:'care'}:DestinationSchema.parse(row.destination)}catch{throw enrollmentError(409,'INCOMPLETE_CASE')};if(destination.planId!==m.planId)throw enrollmentError(409,'INCOMPLETE_CASE');
   const set=await tx.clinicalPhotoSet.findUnique({where:{id:a.photoSetId}});if(!set||set.patientId!==patientId||set.caseId!==caseId||!(set.status==='draft'||['submitted','needs_changes'].includes(set.status)&&row.submittedAt&&row.photoSetId===set.id))throw enrollmentError(409,'INCOMPLETE_PHOTO_SET');const items=(await setDTO(tx,set)).items;await validateClinicalPhotoItems(tx,patientId,set.id,items,requiredClinicalSlots(history),{purpose:'enrollment',id:caseId});
   const patient=await tx.user.findUnique({where:{id:patientId}});if(!patient.dermatologistId){if(!settings.clinicianId||!await tx.dermatologist.findUnique({where:{id:settings.clinicianId}}))throw enrollmentError(409,'INCOMPLETE_CASE');await tx.user.update({where:{id:patientId},data:{dermatologistId:settings.clinicianId}})}
   if(!intake.submittedAt)await tx.intakeRevision.update({where:{id:intake.id},data:{answers:history,submittedAt:now(),attestedAt:now()}});
   if(['draft','needs_changes'].includes(set.status))await tx.clinicalPhotoSet.update({where:{id:set.id},data:{status:'submitted',requiredSlots:requiredClinicalSlots(history)}});
   row=await update(tx,row,{status:'submitted',submittedAt:now(),photoSetId:set.id,planId:m.planId,settingsVersion:settings.version});
   const response=await dto(tx,row);
   await tx.launchCaseSubmission.create({data:{id:randomUUID(),caseId:row.id,patientId,caseRevision:row.revision,settingsVersion:settings.version,submittedAt:row.submittedAt,snapshot:{formatVersion:1,source:'submission',references:{identityId:row.identityId,intakeId:row.intakeId,photoSetId:row.photoSetId},case:response.case,consents:response.consents}}});
   return {response,created:true};
  })}
 };
}
// Storage credentials are loaded only by the normal runtime module on demand.
export const launchEnrollment=createLaunchEnrollment({db:prisma,store:async(path,bytes)=>{const {supabaseAdmin,PHOTO_BUCKET}=await import('../config/supabase');await storeLaunchJPEG(supabaseAdmin.storage.from(PHOTO_BUCKET),path,bytes)},sign:async(path,seconds)=>{const {supabaseAdmin,PHOTO_BUCKET}=await import('../config/supabase');const {data,error}=await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(path,seconds);if(error||!data?.signedUrl)throw enrollmentError(503,'BILLING_UNAVAILABLE');return {url:data.signedUrl,expiresAt:new Date(Date.now()+seconds*1000).toISOString()}},remove:async path=>{const {supabaseAdmin,PHOTO_BUCKET}=await import('../config/supabase');const {error}=await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([path]);if(error)throw enrollmentError(503,'BILLING_UNAVAILABLE')}});
