import type {BillingProvider,BillingEvent,ProviderSnapshot,ProviderContext,CheckoutInput} from './billingProvider';
import {enrollmentError} from './enrollment';
function nextMonth(d:Date){const n=new Date(d),day=n.getUTCDate();n.setUTCDate(1);n.setUTCMonth(n.getUTCMonth()+1);const end=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,0)).getUTCDate();n.setUTCDate(Math.min(day,end));return n.toISOString()}
// All fake identities derive from durable operation IDs; no process-local payment state.
export function createFakeBilling({now=()=>new Date()}:{now?:()=>Date}={}):BillingProvider{
 return {
  kind:'fake',
  async checkout(input:CheckoutInput){return {id:'cs_test_fake_'+input.providerKey,url:input.returnUrl+'?fakeOperation='+input.operationId+'&attempt='+encodeURIComponent(input.providerKey),expiresAt:new Date(now().getTime()+30*60_000).toISOString()}},
  async cancelImmediately(){},
  async refundLatestInvoice(input){if(!input.paymentId||!input.invoiceId||!input.amountCents)throw enrollmentError(503,'BILLING_UNAVAILABLE');return {refundId:'re_fake_'+input.providerKey,paymentId:input.paymentId,invoiceId:input.invoiceId,amountCents:input.amountCents,status:'succeeded'}},
  async expireCheckout(){/* Fake payment truth exists only in the durable, owner-scoped resolution operation. */},
  async portal(input){return {url:'http://127.0.0.1/UNZIT-fake-portal/'+input.membershipId,expiresAt:new Date(now().getTime()+30*60_000).toISOString()}},
  verifyWebhook(){throw enrollmentError(400,'VALIDATION_ERROR')},
  async retrieve(event:BillingEvent,context?:ProviderContext):Promise<ProviderSnapshot|null>{
   if(!context?.operation)return null;
   const {membership:m,operation:o}=context,result=o.result??{},paid=result.fakeOutcome==='succeed';
   const confirmedAt=result.confirmedAt??now().toISOString();
   return {membershipId:m.id,customerId:'cus_fake_'+m.id,subscriptionId:'sub_fake_'+m.id,checkoutSessionId:m.checkoutSessionId??'cs_test_fake_'+o.id,priceId:result.priceId,status:paid?'active':'incomplete',currentPeriodEnd:paid?nextMonth(new Date(confirmedAt)):null,paidThrough:paid?nextMonth(new Date(confirmedAt)):null,cancelAtPeriodEnd:m.cancelAtPeriodEnd??false,observedAt:now().toISOString(),payment:paid?{id:'pi_fake_'+o.id,invoiceId:'in_fake_'+o.id,amountCents:m.amountCents,confirmedAt}:null};
  }
 };
}
