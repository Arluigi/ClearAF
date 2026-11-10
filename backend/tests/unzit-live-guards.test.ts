import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const g=require('../scripts/lib/unzit-live-guards.cjs');
const run=randomUUID();
const account=(role:string)=>({id:randomUUID(),role,email:`clearaf-security-${run}-${role.toLowerCase()}@example.invalid`,password:'synthetic'});
const fixture=()=>({run,accounts:['patientA','patientB','doctorA','doctorB'].map(account),launch:{version:1,run,accounts:['launchA','launchB'].map(account)}});
test('launch evidence refuses hosted targets, URL overrides and live billing credentials before I/O',()=>{
 const env={SUPABASE_URL:'http://127.0.0.1:55321',DATABASE_URL:'postgresql://postgres:synthetic@127.0.0.1:55322/postgres',SECURITY_API_URL:'http://127.0.0.1:3002/api',BILLING_PROVIDER:'fake',NODE_ENV:'development'};
 assert.doesNotThrow(()=>g.validateLocalTargets(env));assert.doesNotThrow(()=>g.validateFakeBillingEnvironment(env));
 for(const key of ['SUPABASE_URL','DATABASE_URL','SECURITY_API_URL'])for(const target of ['https://example.invalid','http://127.0.0.1?host=example.invalid','http://127.0.0.1#override'])assert.throws(()=>g.validateLocalTargets({...env,[key]:target}));
 for(const key of ['STRIPE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY'])assert.throws(()=>g.validateFakeBillingEnvironment({...env,[key]:'sk_live_synthetic'}));
 assert.throws(()=>g.validateFakeBillingEnvironment({...env,BILLING_PROVIDER:'stripe_test'}));
});
test('fixture ownership is the exact six role identities, never a domain or prefix exemption',()=>{
 const f=fixture();assert.doesNotThrow(()=>g.validateFixture(f));
 for(const mutate of [(x:any)=>x.launch.accounts[0].email='other@example.invalid',(x:any)=>x.accounts.push(account('extra')),(x:any)=>x.launch.accounts[0].id=x.accounts[0].id,(x:any)=>x.launch.run=randomUUID()]){const changed=structuredClone(f);mutate(changed);assert.throws(()=>g.validateFixture(changed))}
});
test('allowlist records require exact synthetic run and persist a caller-owned identity',async()=>{
 const calls:any[]=[];const db={query:async(...args:any[])=>{calls.push(args);return {rows:[]}}};const id=randomUUID(),a=account('launchA');
 const row=await g.allowFixture(db,{email:a.email,run,role:'launchA',id});assert.equal(row.id,id);assert.equal(row.importBatch,run);assert.equal(calls.length,1);assert.match(calls[0][0],/INSERT INTO public.launch_allowlist/);assert(!calls[0][0].includes('ON CONFLICT'));
 await assert.rejects(g.allowFixture(db,{email:'unowned@example.invalid',run,role:'launchA'}));assert.equal(calls.length,1);
});
test('owned row validation rejects foreign patients, case edges, clinician edges and live object identifiers',()=>{
 const f=fixture(),[a,b]=f.launch.accounts,d=f.accounts[2];f.launch.caseIds={[a.id]:randomUUID(),[b.id]:randomUUID()};const row={id:randomUUID(),patientId:a.id,caseId:f.launch.caseIds[a.id],clinicianId:d.id};
 assert.doesNotThrow(()=>g.validateOwnedRows(f,'launch_reviews',[row]));
 for(const patch of [{patientId:randomUUID()},{caseId:f.launch.caseIds[b.id]},{clinicianId:f.accounts[3].id},{stripeSubscriptionId:'sub_live_unknown'}])assert.throws(()=>g.validateOwnedRows(f,'launch_reviews',[{...row,...patch}]));
 assert.throws(()=>g.validateOwnedRows(f,'unknown_table',[row]));
});
test('capture freeze validates the graph before trusting attacker-supplied row keys and digests',async()=>{
 const {validateCaptureGraph}=require('../scripts/unzit-launch-live.cjs');const f=fixture();f.launch.caseIds={};f.launch.membershipIds={};f.launch.eventIds=[];
 await assert.rejects(validateCaptureGraph({launch_cases:[{id:randomUUID(),patientId:randomUUID()}]},f));
 await assert.rejects(validateCaptureGraph({unknown_table:[{id:randomUUID()}]},f));
});
test('nested billing intents and refunds must contain fake provider object identities',()=>{
 const f=fixture(),a=f.launch.accounts[0];f.launch.caseIds={[a.id]:randomUUID()};f.launch.membershipIds={[a.id]:randomUUID()};const row={id:randomUUID(),patientId:a.id,membershipId:f.launch.membershipIds[a.id],result:{subscriptionId:'sub_fake_fixture',paymentId:'pi_fake_fixture',invoiceId:'in_fake_fixture',refundId:'re_fake_fixture'}};
 assert.doesNotThrow(()=>g.validateOwnedRows(f,'billing_operations',[row]));
 for(const key of ['subscriptionId','paymentId','invoiceId','refundId'])assert.throws(()=>g.validateOwnedRows(f,'billing_operations',[{...row,result:{...row.result,[key]:'unknown_live_object'}}]));
});
test('allowlist provisioning refuses unrecognized role aliases before database mutation',async()=>{
 let calls=0;const db={query:async()=>{calls++;return {rows:[]}}};await assert.rejects(g.allowFixture(db,{id:randomUUID(),run,role:'unknown',email:`clearaf-security-${run}-unknown@example.invalid`}));assert.equal(calls,0);
});
test('read-only preparation finalization requires approved/rejected cases and exactly settled original invoices',()=>{
 const {assertPreparedJourney}=require('../scripts/unzit-launch-live.cjs');const f=fixture(),[a,b]=f.launch.accounts;f.launch.caseIds={[a.id]:randomUUID(),[b.id]:randomUUID()};f.launch.membershipIds={[a.id]:randomUUID(),[b.id]:randomUUID()};
 const rows={launch_cases:[{id:f.launch.caseIds[a.id],patientId:a.id,status:'approved'},{id:f.launch.caseIds[b.id],patientId:b.id,status:'rejected'}],care_memberships:[{id:f.launch.membershipIds[a.id],patientId:a.id,status:'active',planId:'all_in',cancelAtPeriodEnd:true,destinationRequired:false},{id:f.launch.membershipIds[b.id],patientId:b.id,status:'rejected',refundStatus:'issued'}],billing_payments:[{patientId:a.id,amountCents:3900,refundedCents:0},{patientId:b.id,amountCents:3900,refundedCents:3900}],launch_reviews:Array.from({length:5},()=>({})),prescriptions:[{}],launch_check_in_submissions:[{}]};
 assert.doesNotThrow(()=>assertPreparedJourney(rows,f));for(const mutate of [(r:any)=>r.launch_cases[0].status='submitted',(r:any)=>r.billing_payments.push({...r.billing_payments[0]}),(r:any)=>r.billing_payments[1].refundedCents=0]){const bad=structuredClone(rows);mutate(bad);assert.throws(()=>assertPreparedJourney(bad,f))}
});
test('freeze rejects extra owned-looking templates, consent receipts and check-ins before capturing keys',()=>{
 const {validateLaunchCounts,expectedLaunchCounts}=require('../scripts/unzit-launch-live.cjs');const f=fixture(),owner=f.launch.accounts[0].id;const rows=Object.fromEntries(Object.entries(expectedLaunchCounts).map(([table,count]:any)=>[table,Array.from({length:count},()=>({patientId:owner,userId:owner}))]));assert.doesNotThrow(()=>validateLaunchCounts(rows,f));
 for(const table of ['care_template_revisions','consent_acceptances','launch_check_ins']){const bad=structuredClone(rows);bad[table].push({patientId:owner,userId:owner});assert.throws(()=>validateLaunchCounts(bad,f))}
});
