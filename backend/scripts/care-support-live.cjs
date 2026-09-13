// Loopback-only synthetic care support contract probe. Cleanup uses recorded identities only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
require('dotenv').config({quiet:true});
const {local}=require('./recovery-drill.cjs');
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3002/api';
local(base,['http:','https:']);local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
const db=new Client({connectionString:process.env.DATABASE_URL});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const keep=process.argv.includes('--keep-for-ui'),cleanupOnly=process.argv.includes('--cleanup-ui');
assert(!(keep&&cleanupOnly),'Choose one fixture mode');
const run=crypto.randomUUID();let s={run,accounts:[],revisionIds:[],completionIds:[],formIds:[],responseIds:[],templateIds:[],templateRevisionIds:[]};
const state=path.resolve(process.env.CARE_SUPPORT_FIXTURE_STATE||((keep||cleanupOnly)?'../.local/care-support-ui.json':`../.local/care-support-${run}.json`));
if(cleanupOnly){s=JSON.parse(fs.readFileSync(state,'utf8'));assert(s.run&&Array.isArray(s.accounts)&&Array.isArray(s.formIds),'Invalid fixture manifest')}else assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
function id(kind){const value=crypto.randomUUID();s[kind].push(value);save();return value}
const results=[];function ok(name){results.push(name);console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}}
async function cleanup(){
 for(const a of s.accounts){const {data,error}=await admin.auth.admin.getUserById(a.id);assert(a.email===`clearaf-care-support-${s.run}-${a.role.toLowerCase()}@example.invalid`&&!error&&data.user.email===a.email,'Fixture identity mismatch')}
 const ids=s.accounts.map(a=>a.id);
 await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[ids]);
 // These exact synthetic owners may have added UI rows after the probe.
 for(const [table,column] of [['care_form_responses','userId'],['care_form_revisions','userId'],['care_routine_completions','userId'],['care_routine_revisions','userId'],['care_template_revisions','ownerId']])await db.query(`delete from public.${table} where "${column}"=any($1::uuid[])`,[ids]);
 await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);
 await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
 for(const a of s.accounts){assert(!(await admin.auth.admin.deleteUser(a.id)).error)}
 assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0);
 fs.unlinkSync(state);ok('recorded synthetic accounts, sessions, forms, responses and routines removed');
}
(async()=>{
 await db.connect();if(cleanupOnly){try{await cleanup()}finally{await db.end()}return}save();
 let retained=false;
 try{
  for(const role of ['patientA','patientB','clinicianA','clinicianB']){
   const email=`clearaf-care-support-${run}-${role.toLowerCase()}@example.invalid`,password=crypto.randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Support Test'}});assert(!error,'Synthetic signup failed');
   const account={id:data.user.id,email,role,...(keep?{password}:{})};s.accounts.push(account);save();
   if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[account.id,'Synthetic Support Clinician',email,'UNUSED_SUPABASE_AUTH']);
   const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');Object.defineProperty(account,'token',{value:login.data.session.access_token});
  }
  const [a,b,c,d]=s.accounts;
  await db.query('update user_profiles set "dermatologistId"=case when id=$1::uuid then $3::uuid else $4::uuid end ,"onboardingCompleted"=true where id in($1::uuid,$2::uuid)',[a.id,b.id,c.id,d.id]);
  const support=(url,who=a,method='GET',body)=>call('/care-support'+url,who,method,body);
  const definition={expectedRevisionId:null,name:'Neutral routine',isActive:true,steps:[{title:'Example step',instructions:'Example instruction'}]};
  const template=id('templateIds'),tr=id('templateRevisionIds'),tp=`/templates/${template}/revisions/${tr}`;
  assert.equal((await support('/form',null)).status,401);assert.equal((await support(tp,a,'PUT',definition)).status,403);
  const t=await support(tp,c,'PUT',definition);assert.equal(t.status,201);assert.equal(t.body.template.id,template);assert.equal(t.body.template.revisionId,tr);
  assert.equal((await support(tp,c,'PUT',definition)).status,200);assert.equal((await support(tp,c,'PUT',{...definition,name:'Changed'})).status,409);assert.equal((await support(tp,d,'PUT',definition)).status,404);
  const list=await support('/templates?page=1&limit=1',c);assert.equal(list.body.data[0].id,template);assert.equal(list.body.pagination.total,1);assert.equal((await support('/templates',d)).body.pagination.total,0);
  const r=id('revisionIds');assert.equal((await call(`/routines/patients/${a.id}/morning/revisions/${r}`,c,'PUT',definition)).status,201);
  const tr2=id('templateRevisionIds');assert.equal((await support(`/templates/${template}/revisions/${tr2}`,c,'PUT',{...definition,expectedRevisionId:tr,name:'Changed reusable template'})).status,201);assert.equal((await support(tp,c,'PUT',definition)).status,200);
  const snapshot=await call('/routines/?localDate=2026-01-01',a);assert.equal(snapshot.body.routines[0].name,'Neutral routine');ok('owned immutable template revisions, list, retry conflict and copy isolation');
  const completedAt='2026-01-01T06:30:00Z',localDate='2026-01-01';
  assert.equal((await call(`/routines/completions/${id('completionIds')}`,a,'PUT',{revisionId:r,completedAt,localDate,timeZone:'Asia/Kolkata'})).status,201);
  assert.equal((await call(`/routines/completions/${id('completionIds')}`,a,'PUT',{revisionId:r,completedAt:'2026-02-01T06:30:00Z',localDate:'2026-02-01',timeZone:'Asia/Kolkata'})).status,201);
  const expected={month:'2026-01',days:[{localDate,morning:1,evening:0}]};assert.deepEqual((await support('/calendar?month=2026-01')).body,expected);assert.deepEqual((await support(`/patients/${a.id}/calendar?month=2026-01`,c)).body,expected);assert.deepEqual((await support('/calendar?month=2025-12')).body.days,[]);
  const events=await support('/calendar/events?localDate=2026-01-01&page=1&limit=1');assert.equal(events.body.data[0].routine.id,r);assert.equal(events.body.data[0].localDate,localDate);assert.equal(events.body.pagination.total,1);assert.equal((await support(`/patients/${a.id}/calendar/events?localDate=2026-01-01`,c)).status,200);assert.equal((await support(`/patients/${a.id}/calendar?month=2026-01`,d)).status,404);ok('month inclusive/exclusive reported-date grouping and flat revision day details');
  const question={id:crypto.randomUUID(),prompt:'Choose an example label',type:'choice',required:true,options:[{id:crypto.randomUUID(),label:'First label'},{id:crypto.randomUUID(),label:'Second label'}]};
  const formBody={expectedRevisionId:null,title:'Example check-in',isActive:true,questions:[question,{id:crypto.randomUUID(),prompt:'Optional example text',type:'text',required:false,options:[]}]};
  const f=id('formIds'),fp=`/patients/${a.id}/forms/${f}`;
  assert.equal((await support('/form')).body.form,null);assert.equal((await support(fp,d,'PUT',formBody)).status,404);assert.equal((await support(fp,a,'PUT',formBody)).status,403);assert.equal((await support(fp,c,'PUT',formBody)).status,201);assert.equal((await support(fp,c,'PUT',formBody)).status,200);assert.equal((await support(fp,c,'PUT',{...formBody,title:'Changed'})).status,409);
  assert.equal((await support('/form')).body.form.id,f);assert.equal((await support(`/patients/${a.id}/form`,c)).body.form.id,f);
  for(const patch of [{createdBy:d.id},{questions:[]},{questions:[question,question]},{questions:[{...question,options:[]}]}])assert.equal((await support(`/patients/${a.id}/forms/${id('formIds')}`,c,'PUT',{...formBody,...patch})).status,400);
  const response={formId:f,submittedAt:'2026-01-01T12:00:00Z',answers:[{questionId:question.id,optionId:question.options[0].id}]},rid=id('responseIds');
  assert.equal((await support(`/responses/${rid}`,b,'PUT',response)).status,404);assert.equal((await support(`/responses/${rid}`,c,'PUT',response)).status,403);const first=await support(`/responses/${rid}`,a,'PUT',response);assert.equal(first.status,201);assert.deepEqual((await support(`/responses/${rid}`,a,'PUT',response)).body,first.body);
  assert.equal((await support(`/responses/${rid}`,a,'PUT',{...response,answers:[{questionId:question.id,optionId:question.options[1].id}]})).status,409);
  for(const answers of [[],[response.answers[0],response.answers[0]],[{questionId:question.id,text:'Wrong type'}],[{questionId:question.id,optionId:crypto.randomUUID()}],[{questionId:crypto.randomUUID(),text:'Unknown'}]])assert.equal((await support(`/responses/${id('responseIds')}`,a,'PUT',{...response,answers})).status,400);
  const f2=id('formIds'),f3=id('formIds');const race=await Promise.all([f2,f3].map(id=>support(`/patients/${a.id}/forms/${id}`,c,'PUT',{...formBody,expectedRevisionId:f,title:'Replacement check-in'})));assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);const latest=race.find(r=>r.status===201).body.form;
  assert.equal((await support(`/responses/${id('responseIds')}`,a,'PUT',response)).status,201);assert.equal((await support(fp,c,'PUT',formBody)).status,200);
  const inactive=id('formIds');assert.equal((await support(`/patients/${a.id}/forms/${inactive}`,c,'PUT',{...formBody,expectedRevisionId:latest.id,isActive:false,questions:[]})).status,201);assert.equal((await support(`/responses/${id('responseIds')}`,a,'PUT',{...response,formId:inactive})).status,400);
  const history=await support(`/patients/${a.id}/responses?page=1&limit=1`,c);assert.equal(history.body.data[0].form.title,'Example check-in');assert.equal(history.body.pagination.total,2);assert.equal((await support('/responses')).body.pagination.total,2);assert.equal((await support(`/patients/${a.id}/responses`,d)).status,404);ok('strict clinician forms, concurrent expected revision, immutable response retry and historical prompts');
  const locker=new Client({connectionString:process.env.DATABASE_URL});await locker.connect();try{await locker.query('begin');await locker.query('select id from user_profiles where id=$1 for update',[a.id]);await locker.query('update user_profiles set "dermatologistId"=$1 where id=$2',[d.id,a.id]);const pending=support(`/patients/${a.id}/forms/${id('formIds')}`,c,'PUT',{...formBody,expectedRevisionId:inactive});await new Promise(r=>setTimeout(r,100));await locker.query('commit');assert.equal((await pending).status,404)}finally{await locker.query('rollback');await locker.end()}
  assert.equal((await support(fp,c,'PUT',formBody)).status,404);assert.equal((await support(`/patients/${a.id}/form`,c)).status,404);await db.query('update user_profiles set "dermatologistId"=$1 where id=$2',[c.id,a.id]);ok('assignment serialized and rechecked for writes retries reads');
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,c.token])for(const table of ['care_template_revisions','care_form_revisions','care_form_responses'])for(const method of ['GET','POST','PATCH','DELETE']){const row=table==='care_template_revisions'?tr:table==='care_form_revisions'?f:rid;const result=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${method==='POST'?'':`?id=eq.${row}`}`,{method,headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:['POST','PATCH'].includes(method)?JSON.stringify(method==='POST'?{id:crypto.randomUUID()}:{id:row}):undefined});assert([401,403].includes(result.status),`Direct ${table} ${method}: ${result.status}`)}
  const protections=await db.query("select c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated from pg_class c where c.oid in('care_template_revisions'::regclass,'care_form_revisions'::regclass,'care_form_responses'::regclass)");assert.equal(protections.rows.length,3);assert(protections.rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));ok('three tables RLS enabled and all direct Data API operations denied');
  if(keep){const active=id('formIds');assert.equal((await support(`/patients/${a.id}/forms/${active}`,c,'PUT',{...formBody,expectedRevisionId:inactive})).status,201);s.currentFormId=active;save();retained=true;console.log('Retained exact UI fixture manifest: '+state)}
 }finally{if(!retained)await cleanup();await db.end()}
 console.log(JSON.stringify({passed:true,checks:results.length,cleanup:!retained}));
})().catch(error=>{console.error('Care support live probe failed',error.code||error.message);process.exitCode=1});
