import test from 'node:test';
import assert from 'node:assert/strict';
import {completeIntakeV2} from '../src/services/intakeV2';
const smoke=require('../scripts/hosted-smoke.cjs');
const ref='lhaqeeitxiynzcpqbwpb',patientId='00000000-0000-4000-8000-000000000001';
const email='unzit-smoke-1794440000000@example.invalid';
const env={DATABASE_URL:`postgresql://postgres.${ref}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_ANON_KEY:'synthetic-anon',STRIPE_SECRET_KEY:'sk_test_synthetic'};
const columns=[['user_profiles','id'],['user_profiles','dermatologistId'],['launch_cases','patientId'],['launch_cases','id'],['launch_cases','identityId'],['identity_verifications','patientId'],['identity_verifications','caseId'],['identity_verifications','id'],['skin_photos','userId'],['skin_photos','id'],['photo_reviews','photoId'],['routines','userId'],['routines','id'],['routine_steps','routineId'],['new_owned_table','patientId'],['dermatologists','id'],['launch_settings','clinicianId'],['messages','senderId'],['messages','recipientId']].map(([table,column])=>({table,column}));
const fk=(child:string,parent:string,childColumns:string[],parentColumns=['id'])=>({child,parent,childColumns,parentColumns});
const foreignKeys=[fk('launch_cases','user_profiles',['patientId']),fk('user_profiles','dermatologists',['dermatologistId']),fk('identity_verifications','launch_cases',['caseId','patientId'],['id','patientId']),fk('launch_cases','identity_verifications',['identityId','patientId'],['id','patientId']),fk('photo_reviews','skin_photos',['photoId']),fk('routine_steps','routines',['routineId'])];

test('hosted smoke accepts only the explicit fixed project and env credentials',()=>{
 assert.equal(smoke.parseArgs(['--project-ref',ref]).projectRef,ref);
 for(const args of [[],['--project-ref','b'.repeat(20)],['--project-ref',ref,'--project-ref',ref],['--project-ref',ref,'--apply'],['--project-ref',ref,'--token','synthetic']])assert.throws(()=>smoke.parseArgs(args));
 for(const key of Object.keys(env))for(const value of [undefined,'',' '])assert.throws(()=>smoke.validateEnvironment({...env,[key]:value},ref));
 for(const STRIPE_SECRET_KEY of ['sk_live_synthetic','rk_test_synthetic'])assert.throws(()=>smoke.validateEnvironment({...env,STRIPE_SECRET_KEY},ref));
 for(const patch of [{SUPABASE_URL:'http://localhost:54321'},{SUPABASE_URL:'https://'+'b'.repeat(20)+'.supabase.co'},{DATABASE_URL:env.DATABASE_URL.replace(ref,'b'.repeat(20))},{DATABASE_URL:env.DATABASE_URL.replace(':5432',':6543')},{DATABASE_URL:env.DATABASE_URL.replace('sslmode=require','sslmode=disable')},{DATABASE_URL:env.DATABASE_URL.replace('aws-0-us-east-1.pooler.supabase.com','127.0.0.1')},{HOSTED_API_URL:'http://localhost:3001/api'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}])assert.throws(()=>smoke.validateEnvironment({...env,...patch},ref));
 const target=smoke.validateEnvironment(env,ref);assert.deepEqual(smoke.pgOptions(target,'synthetic-ca').ssl,{ca:'synthetic-ca',rejectUnauthorized:true});
});
test('cleanup discovers all owned tables and indirect children, never shared parents',()=>{
 const plan=smoke.cleanupPlan(columns,foreignKeys);
 const tables=plan.map((x:any)=>x.table);
 for(const table of ['user_profiles','launch_cases','identity_verifications','skin_photos','photo_reviews','routines','routine_steps','new_owned_table','messages'])assert.ok(tables.includes(table));
 for(const table of ['dermatologists','launch_settings'])assert.ok(!tables.includes(table));
 assert.ok(tables.indexOf('photo_reviews')<tables.indexOf('skin_photos'));
 assert.ok(tables.indexOf('routine_steps')<tables.indexOf('routines'));
 assert.ok(tables.indexOf('identity_verifications')<tables.indexOf('launch_cases'));
 assert.equal(tables.at(-1),'user_profiles');
 for(const item of plan){assert.match(item.predicate,/\$1/);assert.ok(!item.predicate.includes(patientId));assert.ok(!/LIKE|example.invalid/.test(item.predicate));}
 assert.match(plan.find((x:any)=>x.table==='photo_reviews').predicate,/EXISTS/);
 assert.throws(()=>smoke.cleanupPlan([...columns,{table:'bad"table',column:'patientId'}],foreignKeys));
});
test('unknown cleanup dependency cycles fail closed',()=>{
 assert.throws(()=>smoke.cleanupPlan(columns,[...foreignKeys,fk('routines','routine_steps',['id'],['routineId'])]));
});
test('storage cleanup paginates recursively and never selects sibling prefixes',async()=>{
 const removed:string[][]=[],listed:string[]=[];let deleted=false;
 const storage={list:async(prefix:string,{offset}:any)=>{listed.push(prefix);return {data:deleted||offset?[]:prefix===patientId?[{name:'one.jpg',id:'object'},{name:'nested',id:null}]:[{name:'two.jpg',id:'object'}],error:null}},remove:async(paths:string[])=>{removed.push(paths);deleted=true;return {data:paths,error:null}}};
 assert.equal(await smoke.cleanupStorage(storage,patientId),2);
 assert.deepEqual(removed.flat().sort(),[patientId+'/nested/two.jpg',patientId+'/one.jpg']);
 assert.ok(listed.every(p=>p===patientId||p.startsWith(patientId+'/')));
 await assert.rejects(smoke.cleanupStorage({...storage,list:async()=>({data:[{name:'../other',id:'object'}],error:null})},patientId));
});
test('storage cleanup refuses a successful remove that leaves objects behind',async()=>{
 const storage={list:async()=>({data:[{name:'one.jpg',id:'object'}],error:null}),remove:async()=>({error:null})};
 await assert.rejects(smoke.cleanupStorage(storage,patientId));
});
test('multi-level indirect selectors keep parent aliases distinct',()=>{
 const plan=smoke.cleanupPlan([...columns,{table:'photo_review_notes',column:'reviewId'},{table:'photo_reviews',column:'id'}],[...foreignKeys,fk('photo_review_notes','photo_reviews',['reviewId'])]);
 const predicate=plan.find((p:any)=>p.table==='photo_review_notes').predicate;
 assert.match(predicate,/EXISTS/);assert.ok(!predicate.includes('p."photoId"=p."id"'));
});
test('cleanup refuses non-synthetic identity before any side effects',async()=>{
 let called=0;
 const deps={db:{query:async()=>{called++;throw Error('must not run')}},admin:{},stripe:{}};
 await assert.rejects(smoke.cleanup({...deps,state:{email:'other@example.invalid',patientId}},{}));assert.equal(called,0);
});
test('headless checkout stops without manufacturing subscriptions or customers',async()=>{
 let paid=0;const state:any={membershipId:'membership',sessionId:'cs_test_synthetic'};
 const stripe={checkout:{sessions:{retrieve:async()=>({id:state.sessionId,livemode:false,mode:'subscription',client_reference_id:'membership',metadata:{membershipId:'membership'},status:'open',subscription:null,invoice:null,customer:null})}},invoices:{pay:async()=>{paid++}}};
 assert.equal(await smoke.payCheckout(stripe,state),false);assert.equal(paid,0);
});
test('headless payment uses only the exact session subscription invoice and test method',async()=>{
 const state:any={membershipId:'membership',sessionId:'cs_test_synthetic'},calls:any[]=[];
 const stripe={checkout:{sessions:{retrieve:async()=>({id:state.sessionId,livemode:false,mode:'subscription',client_reference_id:'membership',metadata:{membershipId:'membership'},status:'open',subscription:'sub_synthetic',customer:'cus_synthetic'})}},subscriptions:{retrieve:async()=>({id:'sub_synthetic',livemode:false,customer:'cus_synthetic',metadata:{membershipId:'membership'},latest_invoice:'in_synthetic'})},invoices:{retrieve:async()=>({id:'in_synthetic',livemode:false,customer:'cus_synthetic',parent:{subscription_details:{subscription:'sub_synthetic'}},status:'open'}),pay:async(...args:any[])=>{calls.push(args);return {livemode:false,status:'paid'}}}};
 assert.equal(await smoke.payCheckout(stripe,state),true);assert.equal(calls[0][0],'in_synthetic');assert.deepEqual(calls[0][1],{payment_method:'pm_card_visa'});
 assert.equal(state.customerId,'cus_synthetic');assert.equal(state.subscriptionId,'sub_synthetic');
 stripe.subscriptions.retrieve=async()=>({id:'sub_synthetic',livemode:true} as any);await assert.rejects(smoke.payCheckout(stripe,state));
});
test('cleanup cancellation checks ownership, expires the open session, and is exact',async()=>{
 const calls:string[]=[],state={email,patientId,membershipId:'membership',sessionId:'cs_test_synthetic'};
 const session={id:state.sessionId,livemode:false,mode:'subscription',client_reference_id:'membership',metadata:{membershipId:'membership'},status:'open',customer:'cus_synthetic',subscription:'sub_synthetic'};
 const stripe={checkout:{sessions:{retrieve:async()=>session,expire:async(id:string)=>{calls.push('expire:'+id);return {livemode:false,status:'expired'}}}},subscriptions:{retrieve:async()=>({id:'sub_synthetic',livemode:false,customer:'cus_synthetic',metadata:{membershipId:'membership'},status:'active'}),cancel:async(id:string)=>{calls.push('cancel:'+id);return {livemode:false,status:'canceled'}}},customers:{retrieve:async()=>({id:'cus_synthetic',livemode:false}),del:async(id:string)=>{calls.push('customer:'+id);return {deleted:true}}}};
 const counts:any={};await smoke.cleanupStripe(stripe,state,counts);assert.deepEqual(calls,['expire:cs_test_synthetic','cancel:sub_synthetic','customer:cus_synthetic']);
 assert.equal(counts.subscriptionsCanceled,1);assert.equal(counts.customersRemoved,1);
 session.client_reference_id='other';await assert.rejects(smoke.cleanupStripe(stripe,state,{}));assert.equal(calls.length,3);
});
test('public API wrapper sends only patient bearer, fixed origin and suppresses provider bodies',async()=>{
 const calls:any[]=[];const api=smoke.patientApi('synthetic-patient-token',async(input:string,init:any)=>{calls.push({input,init});return new Response('{"secret":"provider-private"}',{status:500})});
 await assert.rejects(api('/launch/enrollment'),(error:any)=>error.message==='API_REQUEST_FAILED'&&!JSON.stringify(error).includes('provider-private'));
 assert.equal(calls[0].input,smoke.API_URL+'/launch/enrollment');assert.equal(calls[0].init.headers.Authorization,'Bearer synthetic-patient-token');assert.equal(calls[0].init.redirect,'error');
 await assert.rejects(api('https://other.invalid/path'));assert.equal(calls.length,1);
});
test('minimal synthetic intake is valid and PNG generation contains no faces or IDs',async()=>{
 assert.equal(completeIntakeV2(smoke.syntheticAnswers(),'2026-11-12').B1,'male');
 const images=await smoke.syntheticImages();const sharp=require('sharp');assert.equal((await sharp(images.png).metadata()).format,'png');assert.equal((await sharp(images.jpeg).metadata()).format,'jpeg');
});
test('main never logs raw errors or environment data',async()=>{
 const output:string[]=[];const code=await smoke.main(['--project-ref',ref],env,{createDb:()=>{throw Error('provider-private synthetic-password')},readFile:()=> 'synthetic-ca',log:(s:string)=>output.push(s)});
 assert.equal(code,1);assert.ok(!output.join('').includes('provider-private'));assert.ok(!output.join('').includes('synthetic-password'));assert.ok(!output.join('').includes('sk_test_synthetic'));
});

function failedAuthFixture({lostCreate=false,stripeFailure=false,recoveryFailure=false}={}) {
 let storedEmail='',runId='',created=false,profile=false,allowlisted=false;
 const queries:any[]=[],output:string[]=[];
 const db={on:()=>{},connect:async()=>{},end:async()=>{},query:async(sql:string,values:any[]=[])=>{
  queries.push({sql,values});
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('AS "clinicianCount"'))return {rows:[{clinicianCount:1,allowlistCount:allowlisted?4:3}]};
  if(sql.includes('c.relname AS "table"'))return {rows:columns};
  if(sql.includes('AS "childColumns"'))return {rows:foreignKeys};
  if(sql.includes('pg_trigger'))return {rows:[{count:0}]};
  if(sql.includes('AS present'))return {rows:[{present:false}]};
  if(sql.startsWith('INSERT INTO public.launch_allowlist')){storedEmail=values[0];allowlisted=true;return {rows:[],rowCount:1}}
  if(sql.startsWith('SELECT "importBatch"'))return {rows:[{importBatch:'synthetic-batch'}]};
  if(sql.startsWith('SELECT id FROM auth.users'))return {rows:created?[{id:patientId}]:[]};
  if(sql.startsWith('SELECT id,"checkoutSessionId"')){if(recoveryFailure)throw Error('provider-private');return {rows:stripeFailure?[{id:'membership',checkoutSessionId:'cs_test_synthetic'}]:[]}};
  if(sql.startsWith('DELETE FROM public.launch_allowlist')){allowlisted=false;return {rowCount:1,rows:[]}}
  if(sql.startsWith('DELETE FROM public."user_profiles"')){profile=false;return {rowCount:1,rows:[]}}
  if(sql.startsWith('SELECT count(*)'))return {rows:[{count:sql.includes('auth.users')?(created?1:0):sql.includes('launch_allowlist')?(allowlisted?1:0):0}]};
  return {rows:[],rowCount:0};
 }};
 const admin={auth:{admin:{createUser:async(input:any)=>{created=true;profile=true;runId=input.user_metadata.hosted_smoke;assert.equal(input.email,storedEmail);assert.equal(input.password.length,24);assert.equal(input.email_confirm,true);if(lostCreate)throw Error('provider-private');return {data:{user:{id:patientId,email:storedEmail}},error:null}},deleteUser:async(id:string)=>{assert.equal(id,patientId);assert.equal(profile,false);created=false;return {error:null}}}},storage:{from:(bucket:string)=>{assert.equal(bucket,'patient-photos');return {list:async()=>({data:[],error:null}),remove:async()=>({error:null})}}}};
 const stripe={checkout:{sessions:{retrieve:async()=>{throw Error('provider-private')}}}};
 const client={auth:{signInWithPassword:async()=>({error:{message:'provider-private'}})}};
 let clients=0;
 return {deps:{createDb:()=>db,readFile:()=> 'synthetic-ca',createClient:()=>clients++===0?admin:client,createStripe:()=>stripe,fetcher:async()=>{throw Error('network prohibited')},sleep:async()=>{},log:(s:string)=>output.push(s)},queries,output,created:()=>created,allowlisted:()=>allowlisted,runId:()=>runId};
}
test('finally cleanup recovers exact Auth identity after lost create response and restores baseline',async()=>{
 const f=failedAuthFixture({lostCreate:true});const result=await smoke.runHosted(['--project-ref',ref],env,f.deps);
 assert.equal(result.steps.auth,'fail');assert.equal(result.cleanup.authUsersRemoved,1);assert.equal(result.cleanup.allowlistRemoved,1);assert.equal(result.cleanup.failures,0);
 assert.deepEqual(result.final,result.baseline);assert.equal(f.created(),false);assert.equal(f.allowlisted(),false);
 assert.ok(f.queries.some(q=>q.sql.includes("raw_user_meta_data->>'hosted_smoke'=$2")&&q.values[1]===f.runId()));
 const set=f.queries.findIndex(q=>q.sql.includes('SET LOCAL'));const allow=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO public.launch_allowlist'));assert.ok(set<allow);
});
test('Stripe failure still attempts storage and allowlist, retains membership correlation and reports cleanup failure',async()=>{
 const f=failedAuthFixture({stripeFailure:true});const result=await smoke.runHosted(['--project-ref',ref],env,f.deps);
 assert.equal(result.failure,'CLEANUP_FAILED');assert.ok(result.cleanup.failures>0);assert.equal(result.cleanup.allowlistRemoved,1);assert.equal(result.cleanup.authUsersRemoved,0);
 assert.ok(!f.queries.some(q=>q.sql.startsWith('DELETE FROM public."user_profiles"')));
});
test('failed provider ID recovery retains correlation instead of falsely declaring Stripe clean',async()=>{
 const f=failedAuthFixture({recoveryFailure:true});const result=await smoke.runHosted(['--project-ref',ref],env,f.deps);
 assert.equal(result.failure,'CLEANUP_FAILED');assert.ok(result.cleanup.failures>0);assert.equal(result.cleanup.authUsersRemoved,0);
 assert.ok(!f.queries.some(q=>q.sql.startsWith('DELETE FROM public."user_profiles"')));
});
test('cleanup row deletion materializes selections before child-first deletion and uses transaction-local bypass',async()=>{
 const queries:any[]=[],counts:any={};const db={query:async(sql:string,values:any[])=>{queries.push({sql,values});return {rowCount:sql.startsWith('DELETE')?1:0,rows:[{count:0}]}}};
 const plan=smoke.cleanupPlan(columns,foreignKeys);await smoke.cleanupRows(db,{patientId},plan,counts);
 const selects=queries.filter(q=>q.sql.startsWith('INSERT INTO smoke_cleanup_rows'));const deletes=queries.filter(q=>q.sql.startsWith('DELETE'));
 assert.equal(selects.length,plan.length);assert.equal(deletes.length,plan.length);assert.equal(counts.rowsRemoved,plan.length);
 assert.ok(queries.indexOf(selects.at(-1))<queries.indexOf(deletes[0]));assert.ok(queries.some(q=>q.sql==="SET LOCAL session_replication_role = 'replica'"));
 assert.ok(!queries.some(q=>/ALTER|DISABLE TRIGGER|CASCADE/.test(q.sql)));assert.equal(queries.at(-1).sql,'COMMIT');
 assert.ok(selects.every(q=>q.sql.includes('t.tableoid,t.ctid')&&q.sql.endsWith('FOR UPDATE')));
 assert.ok(deletes.every(q=>q.sql.includes('t.tableoid=s.row_oid')));
});
test('cleanup refuses cross-patient references and rolls back the whole row deletion',async()=>{
 const queries:string[]=[],counts:any={};const db={query:async(sql:string)=>{queries.push(sql);return {rows:[{count:sql.includes('JOIN smoke_cleanup_rows sp')?1:0}],rowCount:0}}};
 await assert.rejects(smoke.cleanupRows(db,{patientId},smoke.cleanupPlan(columns,foreignKeys),counts));
 assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.some(q=>q.startsWith('DELETE')));assert.equal(counts.rowsRemoved,undefined);
});
