import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/contracts/unzitLaunch';
import {validateLaunchDocuments} from '../src/content/launchConsents';
import {validateIntakeV2Catalog,validateLaunchIntakeCatalog} from '../src/content/launchIntake';
import {validateLaunchCheckInContent} from '../src/content/launchCheckIn';
import {revisionInput} from '../src/services/routineCareValidation';
const {parseArgs,validateEnvironment,pgOptions,runHosted,main,readOperatorFile}=require('../scripts/hosted-bootstrap.cjs');
const ref='lhaqeeitxiynzcpqbwpb', id='00000000-0000-4000-8000-000000000001';
const email='launch-clinician@example.invalid', redirect='https://portal.example.invalid/reset-password';
const env={DATABASE_URL:`postgresql://postgres.${ref}:synthetic-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',STRIPE_SECRET_KEY:'sk_test_synthetic'};
const args=(command:string,...rest:string[])=>[command,'--project-ref',ref,...(command==='content'?['--catalog-version','1.0-pending-review']:[]),...rest];
const settingsArgs=['--care-price','price_synthetic_care','--all-in-price','price_synthetic_all_in','--care-cents','3900','--all-in-cents','8900','--clinician-id',id,'--content-version','1.0-pending-review'];
const clinicianArgs=['--email',email,'--redirect',redirect];
const validators={contract,validateLaunchDocuments,validateIntakeV2Catalog,validateLaunchIntakeCatalog,validateLaunchCheckInContent,revisionInput};
const price=(amount:number)=>({billing_scheme:'per_unit',transform_quantity:null,custom_unit_amount:null,livemode:false,active:true,currency:'usd',unit_amount:amount,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
function fixture({clinicians=[{id,email}],users=[] as any[],profile=true}:{clinicians?:any[];users?:any[];profile?:boolean}={}){
 const queries:{sql:string;values:any[]}[]=[],invitations:any[]=[],prices:string[]=[],connections:any[]=[],output:string[]=[];
 const state={clinicians,users,profile,active:{version:1,clinicianId:id,careAmountCents:3900,allInAmountCents:8900,carePriceId:null,allInPriceId:null,contentVersion:'1.0-pending-review',content:{}} as any};
 let ended=0;
 const db={connect:async()=>{},end:async()=>{ended++},query:async(sql:string,values:any[]=[])=>{
  queries.push({sql,values});const q=sql.toLowerCase();
  if(q.includes('count(*)')&&q.includes('from public.dermatologists'))return {rows:[{count:String(state.clinicians.length)}]};
  if(q.includes('from public.dermatologists'))return {rows:state.clinicians,rowCount:state.clinicians.length};
  if(q.includes('from auth.users'))return {rows:state.users,rowCount:state.users.length};
  if(q.includes('from public.launch_allowlist'))return {rows:[{count:'3'}]};
  if(q.includes('from supabase_migrations.schema_migrations'))return {rows:[{count:'12'}]};
  if(q.includes('max(version)'))return {rows:[{version:state.active.version}]};
  if(q.includes('from public.launch_settings'))return {rows:state.active?[state.active]:[]};
  if(q.includes('from public.care_template_revisions'))return {rows:[]};
  if(q.startsWith('insert into public.dermatologists')){state.clinicians=[{id:values[0],email:values[2]}];return {rows:[{id:values[0]}],rowCount:1}}
  if(q.startsWith('insert into public.user_profiles'))state.profile=true;
  return {rows:[],rowCount:1};
 }};
 const admin={auth:{admin:{inviteUserByEmail:async(address:string,options:any)=>{invitations.push({address,options});const user={id,email:address};state.users=[user];return {data:{user},error:null}}}}};
 const deps={createDb:(options:any)=>{connections.push(options);return db},createAdmin:()=>admin,readFile:(file:string)=>file.endsWith('.crt')?'synthetic-ca':file.endsWith('.json')?JSON.stringify(require('../src/content/catalogs/'+require('node:path').basename(file))):'email\nwaitlist@example.invalid\nwaitlist@example.invalid\n',validators,retrievePrice:async(key:string)=>{prices.push(key);return price(key.endsWith('care')?3900:8900)},log:(s:string)=>output.push(s),error:(s:string)=>output.push(s)};
 return {deps,db,admin,queries,invitations,prices,connections,output,state,ended:()=>ended};
}
const writes=(f:ReturnType<typeof fixture>)=>f.queries.filter(({sql})=>/^(insert|update|delete|begin|lock)/i.test(sql));

test('required environment credentials and project-ref are enforced even for dry-run/status',async()=>{
 for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])for(const value of [undefined,'','   ']){const f=fixture();await assert.rejects(runHosted(args('status'),{...env,[key]:value},f.deps));assert.equal(f.connections.length,0)}
 for(const projectRef of ['',ref.toUpperCase(),ref.slice(1),ref+'a','a'.repeat(19)+'1'])assert.throws(()=>validateEnvironment(env,projectRef,'status'));
 assert.doesNotThrow(()=>validateEnvironment(env,ref,'status'));
});
test('ref matches Auth host and database user; local, malformed and transaction-pooler targets are refused',()=>{
 for(const patch of [
  {SUPABASE_URL:'https://'+'b'.repeat(20)+'.supabase.co'},{SUPABASE_URL:`http://${ref}.supabase.co`},{SUPABASE_URL:`https://${ref}.supabase.co.evil.invalid`},
  {SUPABASE_URL:`https://user:password@${ref}.supabase.co`},{SUPABASE_URL:`https://${ref}.supabase.co/other`},
  {DATABASE_URL:env.DATABASE_URL.replace('postgres.'+ref,'postgres.'+'b'.repeat(20))},{DATABASE_URL:env.DATABASE_URL.replace('postgres.'+ref,'postgres')},{DATABASE_URL:'not-a-url'},
  {DATABASE_URL:env.DATABASE_URL.replace(':5432',':6543')},
  ...['localhost','127.0.0.1','127.1.2.3','[::1]','[::ffff:127.0.0.1]','0.0.0.0','db.localhost'].map(host=>({DATABASE_URL:`postgresql://postgres.${ref}:synthetic@${host}:5432/postgres`})),
  ...['http://localhost:54321','http://127.0.0.1:54321','http://[::1]:54321'].map(SUPABASE_URL=>({SUPABASE_URL})),
 ])assert.throws(()=>validateEnvironment({...env,...patch},ref,'status'));
});
test('settings require a test Stripe key from environment; credential CLI flags are rejected',()=>{
 for(const value of [undefined,'','sk_live_synthetic','rk_test_synthetic'])assert.throws(()=>validateEnvironment({...env,STRIPE_SECRET_KEY:value},ref,'settings'));
 assert.doesNotThrow(()=>validateEnvironment({...env,STRIPE_SECRET_KEY:undefined},ref,'status'));
 for(const flag of ['--database-url','--supabase-url','--service-role-key','--stripe-secret-key'])assert.throws(()=>parseArgs(args('status',flag,'synthetic')));
});
test('CLI rejects missing, duplicate, unknown flags and invalid clinician/price inputs',()=>{
 const invalid=[[],['content','--project-ref',ref],args('content','--catalog-version','1.0-pending-review'),['content','--project-ref',ref,'--catalog-version','../1.0-pending-review'],['content','--project-ref',ref,'--catalog-version','99.0-pending-review'],args('unknown'),['status'],args('status','--project-ref',ref),args('status','--apply'),args('content','--email',email),args('waitlist'),args('clinician','--email',email),args('settings',...settingsArgs.slice(0,-2)),args('clinician','--email','bad','--redirect',redirect),args('settings',...settingsArgs.map(x=>x==='3900'?'1':x))];
 for(const url of ['http://localhost/reset-password','https://portal.example.invalid/other',redirect+'?token=synthetic',redirect+'#synthetic','https://user:pass@portal.example.invalid/reset-password'])invalid.push(args('clinician','--email',email,'--redirect',url));
 for(const argv of invalid)assert.throws(()=>parseArgs(argv));
 assert.equal(parseArgs(args('content')).apply,false);assert.equal(parseArgs(args('content','--apply')).apply,true);
});
test('pg explicitly verifies the CA and URL TLS parameters cannot override it',()=>{
 const config=pgOptions(validateEnvironment({...env,DATABASE_URL:env.DATABASE_URL+'?sslmode=require'},ref,'status'),'synthetic-ca');
 assert.deepEqual(config.ssl,{ca:'synthetic-ca',rejectUnauthorized:true});assert.equal(config.connectionString,undefined);assert.equal(config.user,'postgres.'+ref);
 for(const query of ['sslmode=no-verify','sslmode=disable','sslrootcert=/other','host=localhost','options=-c%20search_path%3Devil'])assert.throws(()=>validateEnvironment({...env,DATABASE_URL:env.DATABASE_URL+'?'+query},ref,'status'));
});
test('content preview never writes; apply uses real shared validation and publisher with sole clinician',async()=>{
 const f=fixture();const preview=await runHosted(args('content'),env,f.deps);assert.equal(preview.applied,0);assert.equal(preview.templates,6);assert.equal(writes(f).length,0);
 const result=await runHosted(args('content','--apply'),env,f.deps);assert.equal(result.published,1);assert.equal(result.templates,6);
 const insert=f.queries.find(x=>x.sql.startsWith('INSERT INTO public.launch_settings'))!;assert.equal(insert.values[5],id);assert.equal(insert.values[6],'1.0-pending-review');assert.equal(f.queries.at(-1)?.sql,'COMMIT');assert.equal(f.ended(),2);
 for(const clinicians of [[],[{id,email},{id:'00000000-0000-4000-8000-000000000002',email:'other@example.invalid'}]]){const bad=fixture({clinicians});await assert.rejects(runHosted(args('content','--apply'),env,bad.deps));assert.equal(writes(bad).length,0)}
});
test('settings preview validates actual Stripe contracts and apply uses existing publisher',async()=>{
 for(const apply of [false,true]){const f=fixture();const result=await runHosted(args('settings',...settingsArgs,...(apply?['--apply']:[])),env,f.deps);assert.equal(f.prices.length,2);assert.equal(result.published,apply?1:0);assert.equal(writes(f).length>0,apply)}
 for(const patch of [{livemode:true},{unit_amount:1},{currency:'eur'},{active:false},{billing_scheme:'tiered'},{recurring:{interval:'year'}}]){const f=fixture();f.deps.retrievePrice=async()=>({...price(3900),...patch});await assert.rejects(runHosted(args('settings',...settingsArgs,'--apply'),env,f.deps));assert.equal(writes(f).length,0)}
 const missing=fixture({clinicians:[]});await assert.rejects(runHosted(args('settings',...settingsArgs),env,missing.deps));assert.equal(missing.prices.length,0);
});
test('waitlist shares CSV deduplication; only explicit apply writes, returning counts',async()=>{
 for(const apply of [false,true]){const f=fixture();assert.deepEqual(await runHosted(args('waitlist','synthetic.csv',...(apply?['--apply']:[])),env,f.deps),{parsed:1,applied:apply?1:0});assert.equal(writes(f).length>0,apply)}
 const f=fixture();f.deps.readFile=()=> 'email,email\nsynthetic@example.invalid,synthetic@example.invalid\n';await assert.rejects(runHosted(args('waitlist','synthetic.csv','--apply'),env,f.deps));assert.equal(writes(f).length,0);
});
test('clinician preview never invites; apply allowlists and creates fixture-compatible rows; reruns are safe',async()=>{
 const f=fixture({clinicians:[],profile:false});const preview=await runHosted(args('clinician',...clinicianArgs),env,f.deps);assert.equal(preview.invited,0);assert.equal(preview.wouldInvite,1);assert.equal(f.invitations.length,0);assert.equal(writes(f).length,0);
 const result=await runHosted(args('clinician',...clinicianArgs,'--apply'),env,f.deps);assert.equal(result.clinicianId,id);assert.equal(result.invited,1);assert.deepEqual(f.invitations,[{address:email,options:{redirectTo:redirect,data:{name:'Launch Clinician'}}}]);
 const derm=f.queries.find(x=>/^insert into public.dermatologists/i.test(x.sql))!;assert.deepEqual(derm.values,[id,'Launch Clinician',email,'UNUSED_SUPABASE_AUTH']);assert.ok(f.queries.some(x=>/^insert into public.user_profiles/i.test(x.sql)));
 assert.ok(f.queries.some(x=>x.sql.includes('pg_advisory_lock')));assert.ok(f.queries.at(-1)?.sql.includes('pg_advisory_unlock'));
 const replay=await runHosted(args('clinician',...clinicianArgs,'--apply'),env,f.deps);assert.equal(replay.invited,0);assert.equal(f.invitations.length,1);assert.equal(JSON.stringify(result).includes(email),false);
});
test('clinician repairs partial invitations and refuses conflicting/multiple identities before writing',async()=>{
 const f=fixture({clinicians:[],users:[{id,email}],profile:false});assert.equal((await runHosted(args('clinician',...clinicianArgs,'--apply'),env,f.deps)).invited,0);assert.equal(f.invitations.length,0);assert.equal(f.state.profile,true);
 for(const clinicians of [[{id,email:'other@example.invalid'}],[{id,email},{id:'00000000-0000-4000-8000-000000000002',email}]]){const f=fixture({clinicians});await assert.rejects(runHosted(args('clinician',...clinicianArgs,'--apply'),env,f.deps));assert.equal(f.invitations.length,0);assert.equal(writes(f).length,0)}
 const mismatch=fixture({users:[{id:'00000000-0000-4000-8000-000000000002',email}]});await assert.rejects(runHosted(args('clinician',...clinicianArgs,'--apply'),env,mismatch.deps));assert.equal(writes(mismatch).length,0);
});
test('invitation errors and SQL failures unlock, redact and can be retried without resending',async()=>{
 const f=fixture({clinicians:[]});let allowlisted=false;const query=f.db.query;f.db.query=async(sql:string,values:any[]=[])=>{if(/^INSERT INTO public.launch_allowlist/i.test(sql))allowlisted=true;return query(sql,values)};
 f.admin.auth.admin.inviteUserByEmail=async()=>{assert.equal(allowlisted,true);throw Object.assign(Error('synthetic-secret '+email),{code:email})};
 assert.equal(await main(args('clinician',...clinicianArgs,'--apply'),env,f.deps),1);assert.equal(f.output.join('').includes(email),false);assert.equal(f.output.join('').includes('synthetic-secret'),false);assert.ok(f.queries.at(-1)?.sql.includes('pg_advisory_unlock'));assert.equal(f.ended(),1);
 const partial=fixture({clinicians:[],profile:false});const original=partial.db.query;let fail=true;partial.db.query=async(sql:string,values:any[]=[])=>{if(fail&&/^insert into public.dermatologists/i.test(sql))throw Error('synthetic SQL failure');return original(sql,values)};
 await assert.rejects(runHosted(args('clinician',...clinicianArgs,'--apply'),env,partial.deps));assert.ok(partial.queries.some(x=>x.sql==='ROLLBACK'));fail=false;await runHosted(args('clinician',...clinicianArgs,'--apply'),env,partial.deps);assert.equal(partial.invitations.length,1);
});
test('status is read-only and projects only versions, price ids and counts',async()=>{
 const f=fixture();f.state.active.content={private:'synthetic text'};f.state.active.carePriceId='price_synthetic_care';
 const result=await runHosted(args('status'),env,f.deps);assert.deepEqual(result,{activeContentVersion:'1.0-pending-review',activeSettingsVersion:1,carePriceId:'price_synthetic_care',allInPriceId:null,clinicianCount:1,allowlistCount:3,migrationCount:12});assert.equal(writes(f).length,0);assert.equal(f.invitations.length,0);
 for(const value of [email,'synthetic text','3900','8900',env.SUPABASE_SERVICE_ROLE_KEY])assert.equal(JSON.stringify(result).includes(value),false);
 f.state.active=undefined;assert.equal((await runHosted(args('status'),env,f.deps)).activeSettingsVersion,null);
});
test('CLI catches arbitrary errors and codes and closes even failed connections',async()=>{
 const f=fixture();f.db.connect=async()=>{throw Object.assign(Error(env.DATABASE_URL),{code:env.SUPABASE_SERVICE_ROLE_KEY})};
 assert.equal(await main(args('status'),env,f.deps),1);assert.equal(f.ended(),1);assert.deepEqual(f.output,['Hosted bootstrap failed (OPERATION_FAILED)']);
 const invalid=fixture();assert.equal(await main(args('status'),{},invalid.deps),1);assert.match(invalid.output[0],/^Hosted bootstrap failed \([A-Z_]+\)$/);
});
test('operator file reader rejects secret paths before accessing files',()=>{
 for(const path of ['.env','.env.production','backend/.env.local','ClearAF/Config/Local.generated.xcconfig'])assert.throws(()=>readOperatorFile(path));
});

test('Admin transport suppresses SDK raw-fetch logging and strips provider failure bodies',async()=>{
 const {safeAdminFetch}=require('../scripts/hosted-bootstrap.cjs');
 for(const fetcher of [async()=>{throw Error('synthetic credential')},async()=>new Response('synthetic provider body',{status:500})]){
  const response=await safeAdminFetch('https://auth.example.invalid',{},fetcher);
  assert.equal(response.status,503);assert.equal(await response.text(),'{"msg":"Hosted bootstrap request failed"}');
 }
 const good=new Response('{"synthetic":true}');assert.equal(await safeAdminFetch('https://auth.example.invalid',{},async()=>good),good);
});

test('shared revision validation is importable without constructing a runtime database client',()=>{
 const {revisionInput:pureRevision}=require('../src/services/routineCareValidation');
 assert.equal(pureRevision.parse({expectedRevisionId:null,name:'Draft',isActive:false,steps:[]}).name,'Draft');
 assert.throws(()=>pureRevision.parse({expectedRevisionId:null,name:'Draft',isActive:true,steps:[]}));
});
test('pg asynchronous error events cannot bypass the sanitized CLI error boundary',async()=>{
 const {EventEmitter}=require('node:events');const f=fixture();const db=Object.assign(new EventEmitter(),f.db);
 f.deps.createDb=()=>db;await main(args('status'),env,f.deps);
 assert.equal(db.listenerCount('error'),1);assert.doesNotThrow(()=>db.emit('error',Error('synthetic credential')));
});

test('a pg error event during an operation becomes a controlled failure, never success',async()=>{
 const {EventEmitter}=require('node:events');const f=fixture();const db=Object.assign(new EventEmitter(),f.db);
 db.connect=async()=>{db.emit('error',Object.assign(Error('synthetic secret'),{code:email}))};f.deps.createDb=()=>db;
 assert.equal(await main(args('status'),env,f.deps),1);assert.deepEqual(f.output,['Hosted bootstrap failed (DATABASE_CONNECTION_FAILED)']);assert.equal(f.queries.length,0);
});

test('content selects the requested existing publication and rejects mismatched file identity',async()=>{
 const f=fixture();const argv=['content','--project-ref',ref,'--catalog-version','2.0-pending-review'];
 const result=await runHosted([...argv,'--apply'],env,f.deps);assert.equal(result.published,1);
 const insert=f.queries.find(x=>x.sql.startsWith('INSERT INTO public.launch_settings'))!;assert.equal(insert.values[6],'2.0-pending-review');
 const bad=fixture();const read=bad.deps.readFile;bad.deps.readFile=(file:string)=>file.endsWith('.json')?JSON.stringify(require('../src/content/catalogs/1.0-pending-review.json')):read(file);
 await assert.rejects(runHosted(argv,env,bad.deps));assert.equal(writes(bad).length,0);
});
