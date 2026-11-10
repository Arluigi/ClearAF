import {careAccess} from './careAccess';
import {createBillingLifecycle} from './billingLifecycle';
import {randomUUID,createHash} from 'node:crypto';
import {prisma} from '../config/database';
import {MembershipSchema,BillingResponseSchema,UUIDSchema,DestinationSchema} from '../contracts/unzitLaunch';
import {enrollmentError} from './enrollment';
import {isIntakeV2,evaluateIntakeV2,completeIntakeV2} from './intakeV2';
import {requiredClinicalSlots,validateClinicalPhotoItems} from './clinicalPhotoSets';
import {activeLaunchSettings,selectedLaunchSettings,assertSettingsVersion} from './launchSettings';
import {validateLaunchDocuments} from '../content/launchConsents';
import {checkoutInput,portalInput,fakeResolutionInput,providerEventInput} from './launchBillingValidation';
import {createBillingProvider,billingConfig,BillingProvider,BillingEvent,ProviderSnapshot,ProviderContext} from './billingProvider';
const unavailable=()=>enrollmentError(503,'BILLING_UNAVAILABLE');
const iso=(value:any)=>value===null||value===undefined?null:new Date(value).toISOString();
const equalTime=(a:any,b:any)=>iso(a)===iso(b);
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const maxDate=(a:any,b:any)=>!a?b?new Date(b):null:!b?new Date(a):new Date(Math.max(+new Date(a),+new Date(b)));
export function safeBillingError(error:any){
 const statuses:Record<string,number>={BILLING_UNAVAILABLE:503,NOT_FOUND:404,INSUFFICIENT_PERMISSIONS:403,OPERATION_CONFLICT:409,LAUNCH_STEP_REQUIRED:403,SETTINGS_CHANGED:409,VALIDATION_ERROR:400};
 return error&&statuses[error.code]===error.statusCode&&error.message===error.code?error:unavailable();
}
export function createLaunchBilling({db,provider,now=()=>new Date(),returnOrigin}:{db:any;provider:BillingProvider;now?:()=>Date;returnOrigin:string}){
 const returnUrl=new URL('/api/launch/billing/return',returnOrigin).toString();
 const lock=async(tx:any,patientId:string)=>{await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${patientId}::uuid FOR UPDATE`;if(!await tx.user.findUnique({where:{id:patientId}}))throw enrollmentError(404,'NOT_FOUND')};
 const priceId=(settings:any,planId:string)=>settings[planId==='care'?'carePriceId':'allInPriceId']??(provider.kind==='fake'?`price_fake_${planId}_${settings.version}`:null);
 async function memberDTO(tx:any,m:any){
  if(!m)return null;
  const c=await tx.launchCase.findUnique({where:{id:m.caseId}});
  const access=careAccess(c,m,now())??'enrollment';
  return MembershipSchema.parse({id:m.id,planId:m.planId,status:m.status,amountCents:m.amountCents,currency:m.currency??'usd',activatedAt:iso(m.activatedAt),currentPeriodEnd:iso(m.currentPeriodEnd),paidThrough:iso(m.paidThrough),cancelAtPeriodEnd:m.cancelAtPeriodEnd??false,cadenceAnchor:iso(m.cadenceAnchor),destinationRequired:m.destinationRequired??false,refundStatus:m.refundStatus??'not_applicable',access});
 }
 const response=async(tx:any,m:any,action:any=null)=>BillingResponseSchema.parse({membership:await memberDTO(tx,m),action});
 async function contextFor(membershipId:string,operationId?:string):Promise<ProviderContext>{return db.$transaction(async(tx:any)=>{const m=await tx.careMembership.findUnique({where:{id:membershipId}});if(!m)throw enrollmentError(404,'NOT_FOUND');return {membership:m,operation:operationId?await tx.billingOperation.findUnique({where:{id:operationId}}):undefined}})}
 async function persistEvent(event:BillingEvent){return db.$transaction(async(tx:any)=>{let row=await tx.stripeEvent.findUnique({where:{providerEventId:event.id}});if(!row)row=await tx.stripeEvent.create({data:{providerEventId:event.id,objectId:event.objectId,type:event.type,providerCreatedAt:new Date(event.createdAt),status:'pending',data:{},createdAt:now()}});return row})}
 async function markFailed(event:BillingEvent){await db.$transaction(async(tx:any)=>{const row=await tx.stripeEvent.findUnique({where:{providerEventId:event.id}});if(row&&row.status!=='processed')await tx.stripeEvent.update({where:{id:row.id},data:{status:'failed'}})})}
 async function processEvent(input:BillingEvent,hint?:{membershipId:string;operationId:string}){
  const event=providerEventInput.parse(input) as BillingEvent;
  let stored:any;try{stored=await persistEvent(event)}catch(error){if((error as any).code!=='P2002')throw error;stored=await db.stripeEvent.findUnique({where:{providerEventId:event.id}})}
  if(stored.status==='processed')return {received:true as const};
  if(!['checkout.session.completed'].includes(event.type)&&!event.type.startsWith('customer.subscription.')&&!event.type.startsWith('invoice.')){await db.stripeEvent.update({where:{id:stored.id},data:{status:'processed'}});return {received:true as const}}
  try{
   let context=hint?await contextFor(hint.membershipId,hint.operationId):undefined;
   let snapshot=await provider.retrieve(event,context);
   if(!snapshot){await db.stripeEvent.update({where:{id:stored.id},data:{status:'processed'}});return {received:true as const}}
   // Optimistic provider-read reconciliation: if another webhook wins while retrieval is in flight,
   // retrieve truth again instead of overwriting it with a stale network response.
   for(let attempt=0;attempt<3;attempt++){
    context=await contextFor(snapshot.membershipId,hint?.operationId);
    const expected=context.membership.providerUpdatedAt??null;
    snapshot=await provider.retrieve(event,context);if(!snapshot)throw unavailable();
    const observed=snapshot;
    const applied=await db.$transaction(async(tx:any)=>{
     await lock(tx,context!.membership.patientId);
     const e=await tx.stripeEvent.findUnique({where:{providerEventId:event.id}});if(e.status==='processed')return true;
     const m=await tx.careMembership.findUnique({where:{id:observed.membershipId}});
     if(!m||m.patientId!==context!.membership.patientId)throw unavailable();
     if(!equalTime(m.providerUpdatedAt,expected))return false;
     if(m.stripeCustomerId&&m.stripeCustomerId!==observed.customerId||m.stripeSubscriptionId&&m.stripeSubscriptionId!==observed.subscriptionId||m.checkoutSessionId&&observed.checkoutSessionId&&m.checkoutSessionId!==observed.checkoutSessionId)throw unavailable();
     const settings=await tx.launchSettings.findMany();let selected:any,planId:'care'|'all_in'|undefined;
     const pinned=settings.find((s:any)=>s.version===m.settingsVersion);
     if(pinned&&priceId(pinned,m.planId)===observed.priceId){selected=pinned;planId=m.planId}
     else {
      const matches:any[]=[];for(const s of settings)for(const plan of ['care','all_in'] as const)if(priceId(s,plan)===observed.priceId)matches.push({settings:s,plan});
      if(new Set(matches.map(x=>x.plan)).size!==1)throw unavailable();
      const chosen=matches.sort((a,b)=>b.settings.version-a.settings.version)[0];selected=chosen?.settings;planId=chosen?.plan;
     }
     if(!selected||!planId)throw unavailable();
     const amount=selected[planId==='care'?'careAmountCents':'allInAmountCents'];
     const caseRow=await tx.launchCase.findUnique({where:{id:m.caseId}});
     if(!m.paidThrough&&observed.paidThrough&&(!observed.payment||observed.payment.amountCents!==m.amountCents))throw unavailable();
     for(const p of [observed.payment,...(observed.additionalPayments??[])].filter(Boolean)){if(!Number.isInteger(p.amountCents)||p.amountCents<=0||!Number.isFinite(Date.parse(p.confirmedAt)))throw unavailable();
      const existing=await tx.billingPayment.findUnique({where:{providerInvoiceId:p.invoiceId}});
      if(existing){if(existing.membershipId!==m.id||existing.providerPaymentId!==p.id||existing.amountCents!==p.amountCents)throw unavailable()}
      else await tx.billingPayment.create({data:{membershipId:m.id,patientId:m.patientId,providerPaymentId:p.id,providerInvoiceId:p.invoiceId,amountCents:p.amountCents,refundedCents:0,confirmedAt:new Date(p.confirmedAt)}});
     }
     const paidThrough=maxDate(m.paidThrough,observed.paidThrough),hasPaid=!!paidThrough;
     const settledPlan=observed.paidThrough!==null,changed=settledPlan&&m.planId!==planId;
     if(changed&&(!observed.planChangedAt||!Number.isFinite(Date.parse(observed.planChangedAt))))throw unavailable();
     let status=m.status;
     if(m.status!=='rejected')status=observed.status==='canceled'?'ended':observed.status==='past_due'?'past_due':hasPaid?(caseRow?.status==='approved'?'active':'paid_pending_review'):'awaiting_payment';
     const destination=DestinationSchema.safeParse(caseRow?.destination);
     const update:any={stripeCustomerId:observed.customerId,stripeSubscriptionId:observed.subscriptionId,checkoutSessionId:m.checkoutSessionId??observed.checkoutSessionId,currentPeriodEnd:observed.currentPeriodEnd?new Date(observed.currentPeriodEnd):m.currentPeriodEnd,paidThrough,cancelAtPeriodEnd:observed.cancelAtPeriodEnd,status,providerUpdatedAt:new Date(Math.max(+now(),m.providerUpdatedAt?+new Date(m.providerUpdatedAt)+1:0))};
     if(settledPlan){update.planId=planId;update.amountCents=amount;update.settingsVersion=selected.version}
     if(changed)update.destinationRequired=!destination.success||destination.data.planId!==planId;
     // Delayed delivery can observe a complete switch-back with the same final plan.
     // Only a newer, provider-confirmed change may advance the clinical cadence;
     // preapproval changes and repeated truth must never rewind or reset it.
     const changeAt=settledPlan&&observed.planChangedAt?new Date(observed.planChangedAt):null;
     const cadenceFloor=maxDate(m.cadenceAnchor,m.activatedAt);
     if(caseRow?.status==='approved'&&changeAt&&(!cadenceFloor||changeAt>cadenceFloor))update.cadenceAnchor=changeAt;
     await tx.careMembership.update({where:{id:m.id},data:update});
     if(hasPaid&&caseRow?.status==='payment')await tx.launchCase.update({where:{id:caseRow.id},data:{status:'medical_history',revision:caseRow.revision+1}});
     if(hasPaid){const operation=await tx.billingOperation.findFirst({where:{membershipId:m.id,kind:'checkout'}});if(operation)await tx.billingOperation.update({where:{id:operation.id},data:{status:'succeeded',failureCode:null}})}
     await tx.stripeEvent.update({where:{id:e.id},data:{status:'processed'}});return true;
    });
    if(applied)return {received:true as const};
   }
   throw unavailable();
  }catch(error){await markFailed(event);throw safeBillingError(error)}
 }
 return {
  async get(patientId:string){return db.$transaction(async(tx:any)=>{await lock(tx,patientId);return {membership:await memberDTO(tx,await tx.careMembership.findUnique({where:{patientId}}))}})},
  async checkout(patientId:string,input:unknown){
   const a=checkoutInput.parse(input);
   const prepared=await db.$transaction(async(tx:any)=>{
    await lock(tx,patientId);const c=await tx.launchCase.findUnique({where:{id:a.caseId}});if(!c||c.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');
    let m=await tx.careMembership.findUnique({where:{patientId}});
    if(m&&m.status!=='awaiting_payment'){if(m.planId!==a.planId)throw enrollmentError(409,'OPERATION_CONFLICT');return {done:await response(tx,m)}}
    let settings=c.settingsVersion?await tx.launchSettings.findUnique({where:{version:c.settingsVersion}}):await activeLaunchSettings(tx);if(!settings)throw unavailable();if(!isIntakeV2(settings.contentVersion))settings=await selectedLaunchSettings(tx);assertSettingsVersion(settings,a.settingsVersion);
    if(c.status!=='payment'||!c.eligibility?.eligible||!c.identityId)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
    const identity=await tx.identityVerification.findUnique({where:{id:c.identityId}});if(!identity||identity.patientId!==patientId||identity.caseId!==c.id||!identity.attestedInNC||['rejected','needs_changes'].includes(identity.status))throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
    if(isIntakeV2(settings.contentVersion)){
     const intake=c.intakeId?await tx.intakeRevision.findUnique({where:{id:c.intakeId}}):null;
     let answers:any;try{if(intake?.questionnaireVersion!==settings.contentVersion)throw Error();answers=completeIntakeV2(intake.answers,now().toISOString().slice(0,10))}catch{throw enrollmentError(403,'LAUNCH_STEP_REQUIRED')}
     if(answers.planId!==a.planId||new Date(identity.dateOfBirth).toISOString().slice(0,10)!==answers.A1)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
     if(a.planId==='all_in'){const destination=DestinationSchema.safeParse(c.destination);if(!destination.success||destination.data.planId!=='all_in'||destination.data.shippingAddress.state!=='NC'||answers.G2!=='yes')throw enrollmentError(403,'LAUNCH_STEP_REQUIRED')}
     const set=c.photoSetId?await tx.clinicalPhotoSet.findUnique({where:{id:c.photoSetId}}):null;if(!set||set.patientId!==patientId||set.caseId!==c.id)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');const items=await tx.clinicalPhotoSetItem.findMany({where:{setId:set.id}});await validateClinicalPhotoItems(tx,patientId,set.id,items,requiredClinicalSlots(answers),{purpose:'enrollment',id:c.id});
    }
    let docs:any[];try{docs=validateLaunchDocuments(settings.content?.consents)}catch{throw unavailable()}
    const receipts=await tx.consentAcceptance.findMany({where:{userId:patientId}});if(docs.some(d=>!receipts.some((r:any)=>r.documentKey===d.key&&r.documentVersion===d.version&&r.documentSha256===d.sha256)))throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');
    const price=priceId(settings,a.planId),amount=settings[a.planId==='care'?'careAmountCents':'allInAmountCents'];if(!price||!Number.isInteger(amount)||amount<=0)throw unavailable();
    if(m&&(m.caseId!==c.id||m.planId!==a.planId||m.settingsVersion!==settings.version))throw enrollmentError(409,'OPERATION_CONFLICT');
    if(!m)m=await tx.careMembership.create({data:{patientId,caseId:c.id,planId:a.planId,settingsVersion:settings.version,amountCents:amount,currency:'usd',status:'awaiting_payment',cancelAtPeriodEnd:false,destinationRequired:false,refundStatus:'not_applicable',createdAt:now()}});
    let operation=await tx.billingOperation.findFirst({where:{membershipId:m.id,kind:'checkout'}});
    if(!operation){const id=randomUUID();operation=await tx.billingOperation.create({data:{id,membershipId:m.id,patientId,requestHash:fingerprint({caseId:c.id,planId:a.planId,settingsVersion:settings.version}),providerKey:'unzit-checkout-'+id,kind:'checkout',status:'pending',attempts:0,result:{priceId:price,providerAttemptStartedAt:now().toISOString()},createdAt:now()}})}
    if(operation.result?.action){
     if(new Date(operation.result.action.expiresAt)>now())return {done:await response(tx,m,operation.result.action)};
     const generation=(operation.result.generation??0)+1;
     operation=await tx.billingOperation.update({where:{id:operation.id},data:{status:'pending',providerKey:'unzit-checkout-'+operation.id+'-'+generation,result:{...(operation.result??{}),action:null,generation,previousSessionId:m.checkoutSessionId,providerAttemptStartedAt:now().toISOString()}}});
    }
    // Stripe may retire idempotency keys after 24h. An unrecorded provider success must
    // be verified by an operator/reconciliation lookup before this intent can create again.
    if(now().getTime()-new Date(operation.result?.providerAttemptStartedAt??operation.createdAt).getTime()>23*60*60_000){
     await tx.billingOperation.update({where:{id:operation.id},data:{status:'failed',failureCode:'checkout_verification_required'}});return {quarantined:true};
    }
    return {membership:m,operation,price,amount};
   });
   if(prepared.done)return prepared.done;
   if(prepared.quarantined)throw unavailable();
   const {membership:m,operation:o,price,amount}=prepared;
   const providerKey:string=o.providerKey,previousSessionId:string|undefined=o.result?.previousSessionId;
   try{
    if(previousSessionId)await provider.expireCheckout(previousSessionId,providerKey);
    const session=await provider.checkout({membershipId:m.id,operationId:o.id,providerKey,priceId:price,amountCents:amount,planId:m.planId,returnUrl});
    return await db.$transaction(async(tx:any)=>{await lock(tx,patientId);const current=await tx.careMembership.findUnique({where:{id:m.id}}),op=await tx.billingOperation.findUnique({where:{id:o.id}});if(op.providerKey!==providerKey)return response(tx,current,current.status==='awaiting_payment'?op.result?.action??null:null);if(current.checkoutSessionId&&current.checkoutSessionId!==session.id&&current.checkoutSessionId!==op.result?.previousSessionId)throw unavailable();const saved=await tx.careMembership.update({where:{id:m.id},data:{checkoutSessionId:session.id}});const action={url:session.url,expiresAt:session.expiresAt};await tx.billingOperation.update({where:{id:o.id},data:{result:{...(op.result??{}),priceId:price,action},attempts:{increment:1}}});return response(tx,saved,saved.status==='awaiting_payment'?action:null)});
   }catch(error){await db.$transaction(async(tx:any)=>{await lock(tx,patientId);const op=await tx.billingOperation.findUnique({where:{id:o.id}});if(op&&op.providerKey===providerKey&&op.status!=='succeeded')await tx.billingOperation.update({where:{id:o.id},data:{status:'failed',failureCode:'provider_unavailable',attempts:{increment:1}}})});throw unavailable()}
  },
  async portal(patientId:string,input:unknown){const a=portalInput.parse(input);const context=await db.$transaction(async(tx:any)=>{await lock(tx,patientId);const m=await tx.careMembership.findUnique({where:{id:a.membershipId}});if(!m||m.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');if(!m.stripeCustomerId)throw enrollmentError(403,'LAUNCH_STEP_REQUIRED');return {m,settings:await activeLaunchSettings(tx)}});try{return await provider.portal({customerId:context.m.stripeCustomerId,membershipId:context.m.id,settings:context.settings,returnUrl})}catch{throw unavailable()}},
  async webhook(raw:Buffer,signature:string){let event:BillingEvent;try{event=provider.verifyWebhook(raw,signature)}catch{throw enrollmentError(400,'VALIDATION_ERROR')}return processEvent(event)},
  processEvent,
  async reconcile(limit=25){const counts=await createBillingLifecycle({db,provider,now,reconcileCheckout:async op=>{
   const context=await contextFor(op.membershipId,op.id);if(!context.membership.checkoutSessionId)return 'quarantined';
   await processEvent({id:'reconcile_'+op.id+'_'+now().getTime(),type:'checkout.session.completed',objectId:context.membership.checkoutSessionId,createdAt:now().toISOString()},{membershipId:op.membershipId,operationId:op.id});
   const current=await contextFor(op.membershipId,op.id);return current.operation.status==='succeeded'?'succeeded':'pending';
  }}).reconcile(limit>1?Math.ceil(limit/2):limit);
   const remaining=limit-counts.examined;
   if(remaining>0){const events=await db.stripeEvent.findMany({where:{status:{in:['pending','failed']}},orderBy:[{createdAt:'asc'},{id:'asc'}],take:remaining});for(const event of events.slice(0,remaining)){counts.examined++;try{await processEvent({id:event.providerEventId,type:event.type,objectId:event.objectId,createdAt:iso(event.providerCreatedAt)!});counts.succeeded++}catch{counts.failed++}}}
   return counts;
  },
  async resolveFake(patientId:string,email:string,operationId:string,outcome:'succeed'|'decline'|'requires_action'){
   if(provider.kind!=='fake'||!email.endsWith('@example.invalid'))throw enrollmentError(403,'INSUFFICIENT_PERMISSIONS');UUIDSchema.parse(operationId);fakeResolutionInput.parse({outcome});
   const context=await db.$transaction(async(tx:any)=>{await lock(tx,patientId);const o=await tx.billingOperation.findUnique({where:{id:operationId}});if(!o||o.patientId!==patientId||o.kind!=='checkout')throw enrollmentError(404,'NOT_FOUND');const m=await tx.careMembership.findUnique({where:{id:o.membershipId}});if(!m||m.patientId!==patientId)throw enrollmentError(404,'NOT_FOUND');if(o.result?.fakeOutcome==='succeed'&&outcome!=='succeed')throw enrollmentError(409,'OPERATION_CONFLICT');const result={...(o.result??{}),fakeOutcome:outcome,...(outcome==='succeed'?{confirmedAt:o.result?.confirmedAt??now().toISOString()}: {})};const saved=await tx.billingOperation.update({where:{id:o.id},data:{status:outcome==='succeed'?o.status:outcome==='decline'?'failed':'requires_action',failureCode:outcome==='decline'?'provider_declined':null,result}});return {membership:m,operation:saved}});
   await processEvent({id:'evt_fake_'+operationId+'_'+outcome,type:'checkout.session.completed',objectId:context.membership.checkoutSessionId,createdAt:now().toISOString()},{membershipId:context.membership.id,operationId});
   return db.$transaction(async(tx:any)=>{await lock(tx,patientId);const m=await tx.careMembership.findUnique({where:{id:context.membership.id}});return response(tx,m,outcome==='requires_action'?context.operation.result?.action??null:null)});
  }
 };
}
let runtime:ReturnType<typeof createLaunchBilling>|undefined;
export function runtimeLaunchBilling(){if(!runtime){const config=billingConfig();runtime=createLaunchBilling({db:prisma,provider:createBillingProvider(),returnOrigin:config.returnOrigin})}return runtime}
