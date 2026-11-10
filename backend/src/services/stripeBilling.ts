import Stripe from 'stripe';
import type {BillingConfig,BillingProvider,BillingEvent,ProviderSnapshot} from './billingProvider';
import {enrollmentError} from './enrollment';
const unavailable=()=>enrollmentError(503,'BILLING_UNAVAILABLE');
const iso=(seconds:number|null|undefined)=>typeof seconds==='number'&&Number.isFinite(seconds)?new Date(seconds*1000).toISOString():null;
const objectId=(value:any):string|null=>typeof value==='string'?value:value?.id??null;
function testObject(value:any){if(!value||value.livemode!==false)throw unavailable();return value}
function providerURL(value:string,host:string){const u=new URL(value);if(u.protocol!=='https:'||u.host!==host||u.username||u.password)throw unavailable();return value}
function fixedPrice(price:any,amount?:number,requireActive=true){testObject(price);if(requireActive&&price.active!==true||price.currency!=='usd'||!Number.isInteger(price.unit_amount)||price.unit_amount<=0||amount!==undefined&&price.unit_amount!==amount||price.billing_scheme!=='per_unit'||price.transform_quantity!=null||price.custom_unit_amount!=null||price.recurring?.interval!=='month'||price.recurring.interval_count!==1||price.recurring.usage_type!=='licensed')throw unavailable();return price}
export function createStripeBilling(config:BillingConfig,client?:any,{now=()=>new Date()}:{now?:()=>Date}={}):BillingProvider{
 const stripe:any=client??new Stripe(config.secretKey!,{apiVersion:config.apiVersion,maxNetworkRetries:2,timeout:10000});
 async function invoicePayment(invoice:any){
  testObject(invoice);if(invoice.status!=='paid'||invoice.currency!=='usd')return null;
  if(invoice.amount_paid===0)return null;
  const payments=await stripe.invoicePayments.list({invoice:invoice.id,status:'paid',limit:10});
  if(payments.has_more||payments.data.length!==1)throw unavailable();
  const p=testObject(payments.data[0]),id=objectId(p.payment?.payment_intent)??objectId(p.payment?.charge);
  if(!id||p.currency!=='usd'||p.amount_paid!==invoice.amount_paid||!Number.isInteger(p.amount_paid)||p.amount_paid<=0)throw unavailable();
  return {id,invoiceId:invoice.id,amountCents:p.amount_paid,confirmedAt:iso(p.status_transitions?.paid_at??invoice.status_transitions?.paid_at)!};
 }
 async function subscription(id:string,checkoutSessionId:string|null=null):Promise<ProviderSnapshot>{
  const s=testObject(await stripe.subscriptions.retrieve(id,{expand:['latest_invoice']}));
  if(s.items?.has_more||s.items?.data?.length!==1)throw unavailable();
  const item=s.items.data[0],price=fixedPrice(item.price,undefined,false);if(item.quantity!==1)throw unavailable();
  const invoice=s.latest_invoice?testObject(typeof s.latest_invoice==='string'?await stripe.invoices.retrieve(s.latest_invoice):s.latest_invoice):null;
  const paid=invoice?.status==='paid'&&invoice.amount_remaining===0;
  const payment=paid?await invoicePayment(invoice):null;
  let planChangedAt=paid&&invoice?.billing_reason==='subscription_update'?iso(invoice.status_transitions?.paid_at??invoice.created):null;
  // A delayed event may observe a later renewal. Recover the latest settled change
  // for the current price from bounded provider history, never the event timestamp.
  if(paid&&!planChangedAt&&stripe.invoices?.list){
   const history=await stripe.invoices.list({subscription:s.id,status:'paid',limit:100});
   const changes=history.data.map(testObject).filter((i:any)=>i.status==='paid'&&i.amount_remaining===0&&i.currency==='usd'&&i.billing_reason==='subscription_update'&&i.lines?.has_more===false&&i.lines.data.some((line:any)=>line.amount>=0&&objectId(line.pricing?.price_details?.price??line.price)===price.id));
   changes.sort((a:any,b:any)=>b.created-a.created);if(changes[0])planChangedAt=iso(changes[0].status_transitions?.paid_at??changes[0].created);
  }
  const periodEnd=iso(item.current_period_end);
  if(!s.metadata?.membershipId||!objectId(s.customer)||!periodEnd)throw unavailable();
  return {membershipId:s.metadata.membershipId,customerId:objectId(s.customer)!,subscriptionId:s.id,checkoutSessionId,priceId:price.id,status:s.status==='active'?'active':['past_due','unpaid'].includes(s.status)?'past_due':['canceled','incomplete_expired'].includes(s.status)?'canceled':'incomplete',currentPeriodEnd:periodEnd,paidThrough:paid?periodEnd:null,cancelAtPeriodEnd:s.cancel_at_period_end===true,observedAt:now().toISOString(),planChangedAt,payment};
 }
 return {
  kind:'stripe_test',
  async checkout(input){
   fixedPrice(await stripe.prices.retrieve(input.priceId),input.amountCents);
   const session=testObject(await stripe.checkout.sessions.create({mode:'subscription',line_items:[{price:input.priceId,quantity:1}],client_reference_id:input.membershipId,metadata:{membershipId:input.membershipId,operationId:input.operationId},subscription_data:{metadata:{membershipId:input.membershipId}},success_url:input.returnUrl,cancel_url:input.returnUrl,automatic_tax:{enabled:false},allow_promotion_codes:false},{idempotencyKey:input.providerKey}));
   if(!session.url||!iso(session.expires_at))throw unavailable();return {id:session.id,url:providerURL(session.url,'checkout.stripe.com'),expiresAt:iso(session.expires_at)!};
  },
  async expireCheckout(id,key){
   const existing=testObject(await stripe.checkout.sessions.retrieve(id));
   if(existing.status==='complete')throw enrollmentError(409,'OPERATION_CONFLICT');
   if(existing.status==='expired')return;
   if(existing.status!=='open')throw unavailable();
   const expired=testObject(await stripe.checkout.sessions.expire(id,{}, {idempotencyKey:'unzit-expire-'+key}));
   if(expired.status!=='expired')throw unavailable();
  },
  async portal(input){
   const customer=testObject(await stripe.customers.retrieve(input.customerId));if(customer.deleted)throw unavailable();
   const care=fixedPrice(await stripe.prices.retrieve(input.settings.carePriceId),input.settings.careAmountCents),allIn=fixedPrice(await stripe.prices.retrieve(input.settings.allInPriceId),input.settings.allInAmountCents);
   const products=new Map<string,string[]>();for(const price of [care,allIn]){const id=objectId(price.product);if(!id)throw unavailable();products.set(id,[...(products.get(id)??[]),price.id])}
   const configuration=testObject(await stripe.billingPortal.configurations.create({business_profile:{headline:'UNZIT membership'},default_return_url:input.returnUrl,features:{subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none'},subscription_update:{enabled:true,default_allowed_updates:['price'],billing_cycle_anchor:'unchanged',proration_behavior:'always_invoice',schedule_at_period_end:{conditions:[]},products:[...products].map(([product,prices])=>({product,prices}))},payment_method_update:{enabled:true},invoice_history:{enabled:true}}},{idempotencyKey:'unzit-portal-configuration-'+input.settings.id}));
   const session=testObject(await stripe.billingPortal.sessions.create({customer:input.customerId,configuration:configuration.id,return_url:input.returnUrl}));
   return {url:providerURL(session.url,'billing.stripe.com'),expiresAt:new Date(now().getTime()+30*60_000).toISOString()};
  },
  verifyWebhook(raw,signature){
   try{if(!Buffer.isBuffer(raw)||!signature)throw Error('Invalid');const e=Stripe.webhooks.constructEvent(raw,signature,config.webhookSecret!);testObject(e);const id=objectId(e.data.object);if(!id||!iso(e.created))throw Error('Invalid');return {id:e.id,type:e.type,objectId:id,createdAt:iso(e.created)!}}
   catch{throw enrollmentError(400,'VALIDATION_ERROR')}
  },
  async retrieve(event){
   if(event.type==='checkout.session.completed'){
    const session=testObject(await stripe.checkout.sessions.retrieve(event.objectId));
    if(session.mode!=='subscription'||!objectId(session.subscription))return null;
    const snapshot=await subscription(objectId(session.subscription)!,session.id);
    if(session.client_reference_id!==snapshot.membershipId)throw unavailable();return snapshot;
   }
   if(event.type.startsWith('customer.subscription.'))return subscription(event.objectId);
   if(event.type.startsWith('invoice.')){const invoice=testObject(await stripe.invoices.retrieve(event.objectId));const id=objectId(invoice.parent?.subscription_details?.subscription);if(!id)return null;const snapshot=await subscription(id);const payment=await invoicePayment(invoice);return {...snapshot,additionalPayments:payment?[payment]:[]}}
   return null;
  },
  async resolveRefundTarget(input){
   const subscription=testObject(await stripe.subscriptions.retrieve(input.subscriptionId));
   const invoices=await stripe.invoices.list({subscription:subscription.id,status:'paid',limit:100});
   for(const invoice of invoices.data){testObject(invoice);if(invoice.status!=='paid'||invoice.currency!=='usd')throw unavailable();if(invoice.amount_paid===0)continue;const payment=await invoicePayment(invoice);if(!payment)throw unavailable();return {paymentId:payment.id,invoiceId:payment.invoiceId,amountCents:payment.amountCents,confirmedAt:payment.confirmedAt}}
   throw unavailable();
  },
  async refundLatestInvoice(input){
   const s=testObject(await stripe.subscriptions.retrieve(input.subscriptionId));
   const invoice=input.invoiceId?testObject(await stripe.invoices.retrieve(input.invoiceId)):testObject((await stripe.invoices.list({subscription:s.id,status:'paid',limit:1})).data[0]);if(input.invoiceId&&objectId(invoice.parent?.subscription_details?.subscription)!==s.id)throw unavailable();const payment=await invoicePayment(invoice);if(!payment)throw unavailable();
   if(input.invoiceId&&input.invoiceId!==payment.invoiceId||input.paymentId&&input.paymentId!==payment.id||input.amountCents!==undefined&&input.amountCents!==payment.amountCents)throw unavailable();
   const previous=await stripe.refunds.list({...payment.id.startsWith('pi_')?{payment_intent:payment.id}:{charge:payment.id},limit:100});
   if(previous.has_more)throw unavailable();
   const usable=previous.data.filter((r:any)=>{
    if(objectId(r.payment_intent)!==payment.id&&objectId(r.charge)!==payment.id||r.amount!==payment.amountCents||!['pending','requires_action','succeeded','failed','canceled'].includes(r.status))throw unavailable();
    return ['pending','requires_action','succeeded'].includes(r.status);
   });
   if(usable.length>1)throw unavailable();
   const refund=usable[0]??await stripe.refunds.create({...payment.id.startsWith('pi_')?{payment_intent:payment.id}:{charge:payment.id},amount:payment.amountCents},{idempotencyKey:input.providerKey});
   if(!['pending','requires_action','succeeded','failed','canceled'].includes(refund.status))throw unavailable();
   if(objectId(refund.payment_intent)!==payment.id&&objectId(refund.charge)!==payment.id||refund.amount!==payment.amountCents||!refund.id)throw unavailable();
   return {refundId:refund.id,paymentId:payment.id,invoiceId:payment.invoiceId,amountCents:refund.amount,status:refund.status==='succeeded'?'succeeded':['pending','requires_action'].includes(refund.status)?'pending':'failed'};
  },
  async retrieveRefund(input){
   const invoice=testObject(await stripe.invoices.retrieve(input.invoiceId)),payment=await invoicePayment(invoice);
   if(!payment||payment.id!==input.paymentId||payment.amountCents!==input.amountCents)throw unavailable();
   const refund=await stripe.refunds.retrieve(input.refundId);
   if(!['pending','requires_action','succeeded','failed','canceled'].includes(refund.status))throw unavailable();
   if(refund.id!==input.refundId||objectId(refund.payment_intent)!==payment.id&&objectId(refund.charge)!==payment.id||refund.amount!==payment.amountCents)throw unavailable();
   return {refundId:refund.id,paymentId:payment.id,invoiceId:payment.invoiceId,amountCents:refund.amount,status:refund.status==='succeeded'?'succeeded':['pending','requires_action'].includes(refund.status)?'pending':'failed'};
  },
  async cancelImmediately(id,key){const current=testObject(await stripe.subscriptions.retrieve(id));if(current.status==='canceled')return;const saved=testObject(await stripe.subscriptions.cancel(id,{invoice_now:false,prorate:false},{idempotencyKey:key}));if(saved.status!=='canceled')throw unavailable()}
 };
}
