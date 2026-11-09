import {test} from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createStripeBilling} from '../src/services/stripeBilling';
const secret='whsec_synthetic';const config:any={kind:'stripe_test',secretKey:'sk_test_synthetic',webhookSecret:secret,apiVersion:'2026-10-28.endive',returnOrigin:'http://127.0.0.1:3001'};
const adapter=createStripeBilling(config);
function signed(payload:any){const raw=Buffer.from(JSON.stringify(payload));return {raw,signature:Stripe.webhooks.generateTestHeaderString({payload:raw.toString(),secret})}}
test('webhook verification uses exact signed raw bytes and rejects live events',()=>{
 const payload={id:'evt_synthetic',type:'checkout.session.completed',created:1794240000,livemode:false,data:{object:{id:'cs_test_synthetic'}}},s=signed(payload);
 assert.equal(adapter.verifyWebhook(s.raw,s.signature).id,payload.id);
 assert.throws(()=>adapter.verifyWebhook(Buffer.from(s.raw.toString()+' '),s.signature));assert.throws(()=>adapter.verifyWebhook(s.raw,'invalid'));
 const live=signed({...payload,livemode:true});assert.throws(()=>adapter.verifyWebhook(live.raw,live.signature));
});
test('unrelated signed event retains only minimal routing metadata',()=>{
 const s=signed({id:'evt_ignored',type:'customer.created',created:1794240000,livemode:false,data:{object:{id:'cus_synthetic',email:'synthetic@example.invalid',metadata:{medical:'must-not-persist'}}}});
 const event=adapter.verifyWebhook(s.raw,s.signature);assert.deepEqual(Object.keys(event).sort(),['createdAt','id','objectId','type']);assert.equal(JSON.stringify(event).includes('medical'),false);
});
test('delayed old paid invoice retains its charge without granting a newer unpaid period; archived existing price remains readable',async()=>{
 const old={id:'in_old',livemode:false,status:'paid',currency:'usd',amount_paid:3900,amount_remaining:0,parent:{subscription_details:{subscription:'sub_synthetic'}},status_transitions:{paid_at:1794240000}};
 const current={id:'in_new',livemode:false,status:'open',currency:'usd',amount_paid:0,amount_remaining:3900};
 const existingPrice={id:'price_archived',livemode:false,active:false,currency:'usd',unit_amount:3900,billing_scheme:'per_unit',transform_quantity:null,custom_unit_amount:null,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 const stub={invoices:{retrieve:async()=>old},subscriptions:{retrieve:async()=>({id:'sub_synthetic',livemode:false,customer:'cus_synthetic',metadata:{membershipId:'opaque'},status:'past_due',cancel_at_period_end:false,latest_invoice:current,items:{has_more:false,data:[{quantity:1,current_period_end:1800000000,price:existingPrice}]}})},invoicePayments:{list:async()=>({has_more:false,data:[{livemode:false,payment:{payment_intent:'pi_old'},currency:'usd',amount_paid:3900,status_transitions:{paid_at:1794240000}}]})}};
 const provider=createStripeBilling(config,stub);const snapshot=await provider.retrieve({id:'evt_old',type:'invoice.paid',objectId:'in_old',createdAt:'2026-11-09T18:00:00.000Z'});
 assert.equal(snapshot!.paidThrough,null);assert.equal(snapshot!.payment,null);assert.equal(snapshot!.additionalPayments![0].id,'pi_old');assert.equal(snapshot!.priceId,'price_archived');
});
import {before,after} from 'node:test';
import Module from 'node:module';
let server:any,base:string,webhookCalls=0,fakeCalls=0;
before(async()=>{
 process.env.NODE_ENV='test';process.env.BILLING_PROVIDER='fake';
 const safe=require('../src/services/launchBilling').safeBillingError,original=(Module as any)._load;
 const role=(type:string)=>(req:any,res:any,next:any)=>req.user?.userType===type?next():res.status(403).json({code:'INSUFFICIENT_PERMISSIONS'});
 (Module as any)._load=function(name:string,...args:any[]){
  if(name.endsWith('/middleware/auth'))return {authenticateToken:(req:any,res:any,next:any)=>{if(!req.header('x-synthetic'))return res.status(401).json({code:'INVALID_TOKEN'});req.user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid',userType:req.header('x-synthetic')};next()},requirePatient:role('patient'),requireDermatologist:role('dermatologist')};
  if(name.endsWith('/services/launchBilling'))return {safeBillingError:safe,runtimeLaunchBilling:()=>({get:async()=>({membership:null}),checkout:async()=>({membership:null,action:null}),portal:async()=>({url:'http://127.0.0.1/synthetic',expiresAt:'2026-11-09T18:00:00.000Z'}),resolveFake:async()=>{fakeCalls++;return {membership:null,action:null}},webhook:async(raw:Buffer,signature:string)=>{assert.ok(Buffer.isBuffer(raw));assert.equal(raw.toString(),'{ "synthetic": true }');assert.equal(signature,'synthetic-signature');webhookCalls++;return {received:true}}})};
  return original.call(this,name,...args);
 };
 let app:any;try{app=require('../src/server').default}finally{(Module as any)._load=original}
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api/launch';
});
after(()=>new Promise<void>(r=>server.close(r)));
test('real server raw webhook mount precedes JSON/auth, while patient billing remains authenticated',async()=>{
 const raw=await fetch(base+'/billing/webhook',{method:'POST',headers:{'content-type':'application/json','Stripe-Signature':'synthetic-signature'},body:'{ "synthetic": true }'});assert.equal(raw.status,200);assert.equal(webhookCalls,1);
 assert.equal((await fetch(base+'/billing')).status,401);assert.equal((await fetch(base+'/billing',{headers:{'x-synthetic':'dermatologist'}})).status,403);assert.equal((await fetch(base+'/billing',{headers:{'x-synthetic':'patient'}})).status,200);
});
test('browser return is generic, never confirms payment; fake endpoint rejects unknown keys',async()=>{
 const returned=await fetch(base+'/billing/return?membership=opaque-synthetic&paid=true');const text=await returned.text();assert.equal(returned.status,200);assert.ok(text.includes('Return to UNZIT'));assert.equal(text.includes('opaque-synthetic'),false);assert.equal(text.includes('paid=true'),false);
 const r=await fetch(base+'/billing/fake/operations/00000000-0000-4000-8000-000000000001/resolve',{method:'POST',headers:{'content-type':'application/json','x-synthetic':'patient'},body:JSON.stringify({outcome:'succeed',amountCents:1})});assert.equal(r.status,400);assert.equal(fakeCalls,0);
});
