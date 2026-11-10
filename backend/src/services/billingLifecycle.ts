import {randomUUID} from 'node:crypto';
import type {BillingProvider} from './billingProvider';
import {enrollmentError} from './enrollment';
// Caller holds the patient profile lock and has validated ownership/eligibility,
// or current clinician assignment for a manual review. Automatic eligibility exits
// do not fabricate a clinician decision. No provider I/O occurs in this transaction.
export async function queueRejectionRefund(tx:any,{membership:m,decisionId,now=new Date()}:{membership:any;decisionId?:string;now?:Date}){
 const existing=await tx.billingOperation.findFirst({where:{membershipId:m.id,kind:'refund'}});
 if(existing){
  await tx.careMembership.update({where:{id:m.id},data:{status:'rejected'}});
  if(existing.status==='succeeded'&&decisionId){const decision=await tx.careDecision.findUnique({where:{id:decisionId}});if(decision?.patientId===m.patientId)await tx.careDecision.update({where:{id:decisionId},data:{refundStatus:'issued',refundUpdatedAt:now}})}
  const result={...(existing.result??{}),decisionIds:[...new Set([...(existing.result?.decisionIds??[]),...(decisionId?[decisionId]:[])])]};return tx.billingOperation.update({where:{id:existing.id},data:{result}})}
 const payments=await tx.billingPayment.findMany({where:{membershipId:m.id},orderBy:[{confirmedAt:'desc'},{id:'desc'}],take:1});const payment=payments[0];
 if(!m.stripeSubscriptionId||!payment||payment.refundedCents!==0)throw enrollmentError(409,'REFUND_NOT_PENDING');
 const id=randomUUID(),result={decisionIds:decisionId?[decisionId]:[],subscriptionId:m.stripeSubscriptionId,paymentId:payment.providerPaymentId,invoiceId:payment.providerInvoiceId,amountCents:payment.amountCents,canceled:false,targetBound:false};
 const operation=await tx.billingOperation.create({data:{id,membershipId:m.id,patientId:m.patientId,kind:'refund',status:'pending',attempts:0,providerKey:'unzit-rejection-'+id,requestHash:'rejection:'+m.id,result,createdAt:now}});
 await tx.careMembership.update({where:{id:m.id},data:{status:'rejected',refundStatus:'pending'}});return operation;
}
export function createBillingLifecycle({db,provider,now=()=>new Date(),reconcileCheckout}:{db:any;provider:BillingProvider;now?:()=>Date;reconcileCheckout?:(op:any)=>Promise<'succeeded'|'pending'|'quarantined'>}){
 const lock=async(tx:any,patientId:string)=>{await tx.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${patientId}::uuid FOR UPDATE`};
 async function run(id:string){
  const op=await db.billingOperation.findUnique({where:{id}});if(!op||op.kind!=='refund'||op.status==='succeeded')return 'skipped';
  let r=op.result??{};
  try{
   if(!provider.cancelImmediately||!provider.refundLatestInvoice)throw Error('Unavailable');
   if(!r.canceled){await provider.cancelImmediately(r.subscriptionId,op.providerKey+'-cancel');await db.$transaction(async(tx:any)=>{await lock(tx,op.patientId);const current=await tx.billingOperation.findUnique({where:{id}});await tx.billingOperation.update({where:{id},data:{result:{...current.result,canceled:true}}})})}
   if(!r.targetBound&&!r.refundId&&provider.resolveRefundTarget){
    const target=await provider.resolveRefundTarget({subscriptionId:r.subscriptionId,paymentId:r.paymentId,invoiceId:r.invoiceId,amountCents:r.amountCents});
    if(!target.paymentId||!target.invoiceId||!Number.isInteger(target.amountCents)||target.amountCents<=0||!Number.isFinite(Date.parse(target.confirmedAt)))throw Error('Invalid target');
    r=await db.$transaction(async(tx:any)=>{await lock(tx,op.patientId);const current=await tx.billingOperation.findUnique({where:{id}});if(current.result.targetBound||current.result.refundId)return current.result;
     const payment=await tx.billingPayment.findUnique({where:{providerInvoiceId:target.invoiceId}});
     if(payment){if(payment.membershipId!==op.membershipId||payment.providerPaymentId!==target.paymentId||payment.amountCents!==target.amountCents)throw Error('Invalid ledger')}
     else await tx.billingPayment.create({data:{membershipId:op.membershipId,patientId:op.patientId,providerInvoiceId:target.invoiceId,providerPaymentId:target.paymentId,amountCents:target.amountCents,refundedCents:0,confirmedAt:new Date(target.confirmedAt)}});
     const result={...current.result,...target,targetBound:true};await tx.billingOperation.update({where:{id},data:{result}});return result;
    });
   }
   let generation=r.generation??0;
   let refund=r.refundId&&provider.retrieveRefund?await provider.retrieveRefund({refundId:r.refundId,paymentId:r.paymentId,invoiceId:r.invoiceId,amountCents:r.amountCents}):await provider.refundLatestInvoice({subscriptionId:r.subscriptionId,providerKey:op.providerKey+(generation?'-'+generation:''),paymentId:r.paymentId,invoiceId:r.invoiceId,amountCents:r.amountCents});
   if(!refund.refundId||refund.paymentId!==r.paymentId||refund.invoiceId!==r.invoiceId||refund.amountCents!==r.amountCents||!['pending','failed','succeeded'].includes(refund.status))throw Error('Invalid provider truth');
   if(r.refundId&&refund.status==='failed'){
    // Only provider-confirmed terminal failure permits a fresh idempotency generation.
    // Concurrent reconciliations join the generation chosen under the profile lock.
    generation=await db.$transaction(async(tx:any)=>{await lock(tx,op.patientId);const current=await tx.billingOperation.findUnique({where:{id}});if(current.status==='succeeded')return -1;const g=current.result.generation??0;if(g!==generation)return g;if(g>=3){await tx.billingOperation.update({where:{id},data:{status:'failed',failureCode:'refund_verification_required',nextAttemptAt:null}});return -2;}await tx.billingOperation.update({where:{id},data:{result:{...current.result,refundId:null,generation:g+1}}});return g+1});
    if(generation<0)return generation===-2?'quarantined':'skipped';
    refund=await provider.refundLatestInvoice({subscriptionId:r.subscriptionId,providerKey:op.providerKey+'-'+generation,paymentId:r.paymentId,invoiceId:r.invoiceId,amountCents:r.amountCents});
    if(!refund.refundId||refund.paymentId!==r.paymentId||refund.invoiceId!==r.invoiceId||refund.amountCents!==r.amountCents||!['pending','failed','succeeded'].includes(refund.status))throw Error('Invalid provider truth');
   }

   return await db.$transaction(async(tx:any)=>{await lock(tx,op.patientId);const current=await tx.billingOperation.findUnique({where:{id}});if(current.status==='succeeded'||(current.result.generation??0)!==generation)return 'skipped';
    const payment=await tx.billingPayment.findUnique({where:{providerInvoiceId:r.invoiceId}});if(!payment||payment.membershipId!==op.membershipId||payment.amountCents!==r.amountCents||payment.providerPaymentId!==r.paymentId||payment.refundedCents>r.amountCents)throw Error('Invalid ledger');
    const issued=refund.status==='succeeded',status=issued?'issued':refund.status==='failed'?'failed':'pending';
    if(issued)await tx.billingPayment.update({where:{id:payment.id},data:{refundedCents:r.amountCents,refundedAt:now()}});
    for(const decisionId of current.result?.decisionIds??[]){const decision=await tx.careDecision.findUnique({where:{id:decisionId}});if(decision?.patientId===op.patientId)await tx.careDecision.update({where:{id:decisionId},data:{refundStatus:issued?'issued':'pending',refundUpdatedAt:issued?now():null}})}
    await tx.careMembership.update({where:{id:op.membershipId},data:{refundStatus:status}});
    await tx.billingOperation.update({where:{id},data:{status:issued?'succeeded':refund.status==='failed'?'failed':'pending',attempts:{increment:1},failureCode:refund.status==='failed'?'provider_refund_failed':null,result:{...current.result,refundId:refund.refundId},nextAttemptAt:issued?null:new Date(now().getTime()+60_000)}});return issued?'succeeded':refund.status==='failed'?'failed':'pending';
   });
  }catch{
   await db.$transaction(async(tx:any)=>{await lock(tx,op.patientId);const current=await tx.billingOperation.findUnique({where:{id}});if(current.status==='succeeded')return;await tx.billingOperation.update({where:{id},data:{status:'failed',attempts:{increment:1},failureCode:'provider_unavailable',nextAttemptAt:new Date(now().getTime()+60_000)}});await tx.careMembership.update({where:{id:op.membershipId},data:{refundStatus:'failed'}})});return 'failed';
  }
 }
 return {async reconcile(limit=25){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw enrollmentError(400,'VALIDATION_ERROR');
  const counts={examined:0,succeeded:0,pending:0,failed:0,skipped:0,quarantined:0};
  counts.quarantined=await db.billingOperation.count({where:{status:{in:['pending','failed','requires_action']},failureCode:{in:['checkout_verification_required','refund_verification_required']}}});
  const due={OR:[{nextAttemptAt:null},{nextAttemptAt:{lte:now()}}]},status={in:['pending','failed','requires_action']};
  const refunds=await db.billingOperation.findMany({where:{kind:'refund',status,AND:[due,{OR:[{failureCode:null},{failureCode:{notIn:['refund_verification_required']}}]}]},orderBy:[{nextAttemptAt:{sort:'asc',nulls:'first'}},{createdAt:'asc'},{id:'asc'}],take:limit});
  for(const op of refunds.slice(0,limit)){counts.examined++;counts[await run(op.id) as 'succeeded'|'pending'|'failed'|'skipped'|'quarantined']++}
  const remaining=limit-counts.examined;
  if(remaining>0&&reconcileCheckout){const checkouts=await db.billingOperation.findMany({where:{kind:'checkout',status,AND:[due,{OR:[{failureCode:null},{failureCode:{notIn:['checkout_verification_required']}}]}]},orderBy:[{nextAttemptAt:{sort:'asc',nulls:'first'}},{createdAt:'asc'},{id:'asc'}],take:remaining});
   for(const op of checkouts.slice(0,remaining)){counts.examined++;try{const outcome=await reconcileCheckout(op);counts[outcome]++;if(outcome!=='succeeded')await db.billingOperation.update({where:{id:op.id},data:{nextAttemptAt:new Date(now().getTime()+15*60_000),...(outcome==='quarantined'?{failureCode:'checkout_verification_required'}:{})}})}catch{counts.failed++;await db.billingOperation.update({where:{id:op.id},data:{nextAttemptAt:new Date(now().getTime()+15*60_000)}})}}
  }
  return counts;
 }};
}
