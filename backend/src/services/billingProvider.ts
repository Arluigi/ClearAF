import {createFakeBilling} from './fakeBilling';
import {createStripeBilling} from './stripeBilling';
import {enrollmentError} from './enrollment';
export const STRIPE_API_VERSION='2026-10-28.endive' as const;
export type BillingConfig={kind:'fake'|'stripe_test';returnOrigin:string;secretKey?:string;webhookSecret?:string;apiVersion:typeof STRIPE_API_VERSION};
export type CheckoutInput={membershipId:string;operationId:string;providerKey:string;priceId:string;amountCents:number;planId:'care'|'all_in';returnUrl:string};
export type ProviderCheckout={id:string;url:string;expiresAt:string};
export type BillingEvent={id:string;type:string;objectId:string;createdAt:string};
export type ProviderSnapshot={membershipId:string;customerId:string;subscriptionId:string;checkoutSessionId:string|null;priceId:string;status:'incomplete'|'active'|'past_due'|'canceled';currentPeriodEnd:string|null;paidThrough:string|null;cancelAtPeriodEnd:boolean;observedAt:string;planChangedAt?:string|null;payment:null|{id:string;invoiceId:string;amountCents:number;confirmedAt:string};additionalPayments?:{id:string;invoiceId:string;amountCents:number;confirmedAt:string}[]};
export type ProviderContext={membership:any;operation?:any};
export interface BillingProvider{
 kind:'fake'|'stripe_test';
 checkout(input:CheckoutInput):Promise<ProviderCheckout>;
 expireCheckout(sessionId:string,providerKey:string):Promise<void>;
 portal(input:{customerId:string;membershipId:string;settings:any;returnUrl:string}):Promise<{url:string;expiresAt:string}>;
 verifyWebhook(raw:Buffer,signature:string):BillingEvent;
 retrieve(event:BillingEvent,context?:ProviderContext):Promise<ProviderSnapshot|null>;
 refundLatestInvoice?(input:{subscriptionId:string;providerKey:string;paymentId?:string;invoiceId?:string;amountCents?:number}):Promise<{refundId:string;paymentId:string;invoiceId:string;amountCents:number;status:'pending'|'succeeded'|'failed'}>;
 resolveRefundTarget?(input:{subscriptionId:string;paymentId:string;invoiceId:string;amountCents:number}):Promise<{paymentId:string;invoiceId:string;amountCents:number;confirmedAt:string}>;
 retrieveRefund?(input:{refundId:string;paymentId:string;invoiceId:string;amountCents:number}):Promise<{refundId:string;paymentId:string;invoiceId:string;amountCents:number;status:'pending'|'succeeded'|'failed'}>;
 cancelImmediately?(subscriptionId:string,providerKey:string):Promise<void>;
}
const unavailable=()=>enrollmentError(503,'BILLING_UNAVAILABLE');
function local(value:string|undefined,protocols:string[]){try{const u=new URL(value!);return protocols.includes(u.protocol)&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!u.search&&!u.hash}catch{return false}}
export function billingConfig(env:Record<string,string|undefined>=process.env):BillingConfig{
 const origin=env.BILLING_RETURN_ORIGIN;
 let url:URL;try{url=new URL(origin!)}catch{throw unavailable()}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw unavailable();
 const kind=env.BILLING_PROVIDER;
 if(kind==='fake'){
  if(!['test','development'].includes(env.NODE_ENV??'')||!local(env.SUPABASE_URL,['http:','https:'])||!local(env.DATABASE_URL,['postgres:','postgresql:'])||!local(origin,['http:','https:']))throw unavailable();
 }else if(kind==='stripe_test'){
  if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')||env.STRIPE_API_VERSION!==STRIPE_API_VERSION)throw unavailable();
 }else throw unavailable();
 return {kind,returnOrigin:url.origin,apiVersion:STRIPE_API_VERSION,...(kind==='stripe_test'?{secretKey:env.STRIPE_SECRET_KEY,webhookSecret:env.STRIPE_WEBHOOK_SECRET}:{})};
}
export function createBillingProvider(env:Record<string,string|undefined>=process.env):BillingProvider{const config=billingConfig(env);return config.kind==='fake'?createFakeBilling():createStripeBilling(config)}
export function isLoopbackPeer(value:string|undefined){return !!value&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(value)}
