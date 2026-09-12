// Loopback-only synthetic routine contract probe. Cleanup uses recorded identities only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
require('dotenv').config({quiet:true});
const {local}=require('./recovery-drill.cjs');
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3002/api';
local(base,['http:','https:']);local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
const db=new Client({connectionString:process.env.DATABASE_URL});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const run=crypto.randomUUID(),s={run,accounts:[],revisionIds:[],completionIds:[]};
const state=path.resolve(process.env.ROUTINE_FIXTURE_STATE||`../.local/routine-care-${run}.json`);
assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
function id(kind){const value=crypto.randomUUID();s[kind].push(value);save();return value}
const results=[];function ok(name){results.push(name);console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+'/routines'+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}}
async function cleanup(){
 for(const a of s.accounts){const {data,error}=await admin.auth.admin.getUserById(a.id);assert(!error&&data.user.email===a.email,'Fixture identity mismatch')}
 const ids=s.accounts.map(a=>a.id);
 await db.query('delete from care_routine_completions where id=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.completionIds,ids]);
 await db.query('delete from care_routine_revisions where id=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.revisionIds,ids]);
 await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);
 await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
 for(const a of s.accounts){assert(!(await admin.auth.admin.deleteUser(a.id)).error)}
 assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0);
 fs.unlinkSync(state);ok('recorded synthetic accounts, revisions and completions removed');
}
(async()=>{
 await db.connect();save();
 try{
  for(const role of ['patientA','patientB','clinicianA','clinicianB']){
   const email=`clearaf-routine-${run}-${role.toLowerCase()}@example.invalid`,password=crypto.randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Routine Test'}});assert(!error,'Synthetic signup failed');
   const account={id:data.user.id,email,role};s.accounts.push(account);save();
   if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[account.id,'Synthetic Routine Clinician',email,'UNUSED_SUPABASE_AUTH']);
   const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');Object.defineProperty(account,'token',{value:login.data.session.access_token});
  }
  const [a,b,c,d]=s.accounts;
  await db.query('update user_profiles set "dermatologistId"=case when id=$1::uuid then $3::uuid else $4::uuid end where id in($1::uuid,$2::uuid)',[a.id,b.id,c.id,d.id]);
  const definition={expectedRevisionId:null,name:'Original synthetic routine',isActive:true,steps:[{title:'Synthetic step',instructions:'Synthetic instructions'}]};
  const edit=(revision,body=definition,who=c,patient=a.id,slot='morning')=>call(`/patients/${patient}/${slot}/revisions/${revision}`,who,'PUT',body);
  const r1=id('revisionIds');assert.equal((await call('/')).status,401);assert.equal((await call('/',a,'POST',{})).status,403);assert.equal((await edit(r1,definition,a)).status,403);assert.equal((await edit(r1,definition,d)).status,404);ok('anonymous, patient authoring and wrong clinician denied');
  const first=await edit(r1);assert.equal(first.status,201);assert.equal(first.body.routine.createdBy,c.id);assert.equal(first.body.routine.version,1);assert.equal((await edit(r1)).status,200);assert.equal((await edit(r1,{...definition,name:'Changed'})).status,409);ok('clinician assignment and stable revision retry');
  const r2=id('revisionIds'),r3=id('revisionIds');const competing=await Promise.all([edit(r2,{...definition,expectedRevisionId:r1,name:'Edited synthetic routine'}),edit(r3,{...definition,expectedRevisionId:r1,name:'Edited synthetic routine'})]);assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);const current=competing.find(r=>r.status===201).body.routine;assert.equal(current.version,2);assert.equal((await edit(r1)).status,200);ok('concurrent expected-revision conflict and historical ID retry');
  const body={revisionId:r1,completedAt:'2026-01-01T06:30:00.000Z',localDate:'2026-01-01',timeZone:'Asia/Kolkata'};
  const complete=(completion,event=body,who=a)=>call(`/completions/${completion}`,who,'PUT',event);
  const e1=id('completionIds'),e2=id('completionIds');assert.equal((await complete(e1,body,b)).status,404);assert.equal((await complete(e1,body,c)).status,403);
  const races=await Promise.all([complete(e1),complete(e2)]);assert.deepEqual(races.map(r=>r.status).sort(),[200,201]);assert.equal(races[0].body.completion.id,races[1].body.completion.id);const canonical=races[0].body.completion;
  assert.deepEqual((await complete(canonical.id)).body.completion,canonical);assert.deepEqual((await complete(id('completionIds'),{...body,completedAt:'2026-01-01T07:00:00Z'})).body.completion,canonical);assert.equal((await complete(canonical.id,{...body,timeZone:'UTC'})).status,409);ok('old revision completion, owner checks, concurrent daily canonical ID and immutable metadata');
  const otherRevision=id('revisionIds');assert.equal((await edit(otherRevision,definition,d,b.id)).status,201);assert.equal((await complete(canonical.id,{...body,revisionId:otherRevision},b)).status,404);ok('cross-patient completion ID concealed even with caller-owned revision');
  const snap=await call('/?localDate=2026-01-01',a);assert.equal(snap.status,200);assert.equal(snap.body.routines[0].id,current.id);assert.equal(snap.body.completions[0].revisionId,r1);
  const history=await call(`/patients/${a.id}/completions?page=1&limit=1`,c);assert.equal(history.body.data[0].routine.name,'Original synthetic routine');assert.deepEqual(history.body.pagination,{page:1,limit:1,total:1,totalPages:1});assert.equal((await call(`/patients/${a.id}/completions`,d)).status,404);ok('snapshot and paginated history retain actual completed revision');
  for(const patch of [{completedAt:'2026-02-30T06:30:00Z'},{localDate:'2026-02-30'},{localDate:'2025-12-31'},{timeZone:'invalid/zone'},{timeZone:'+05:30'},{completedAt:new Date(Date.now()+600000).toISOString()},{userId:b.id}])assert.equal((await complete(id('completionIds'),{...body,...patch})).status,400);
  assert.equal((await edit('not-a-uuid')).status,400);assert.equal((await call(`/patients/${a.id}/completions?limit=51`,c)).status,400);ok('strict dates, timezone, future skew, UUID and body validation');
  const archived=id('revisionIds');assert.equal((await edit(archived,{...definition,expectedRevisionId:current.id,isActive:false,steps:[]})).status,201);assert.equal((await complete(id('completionIds'),{...body,revisionId:archived})).status,400);ok('archival preserves revisions and rejects completion of inactive revision');
  // Reassignment takes the same row lock as the API. A queued write must authorize after it.
  const locker=new Client({connectionString:process.env.DATABASE_URL});await locker.connect();
  try{await locker.query('begin');await locker.query('select id from user_profiles where id=$1 for update',[a.id]);await locker.query('update user_profiles set "dermatologistId"=$1 where id=$2',[d.id,a.id]);const pending=edit(id('revisionIds'),{...definition,expectedRevisionId:archived});await new Promise(r=>setTimeout(r,100));await locker.query('commit');assert.equal((await pending).status,404)}finally{await locker.query('rollback');await locker.end()}
  assert.equal((await edit(r1)).status,404);assert.equal((await call(`/patients/${a.id}`,c)).status,404);assert.equal((await call(`/patients/${a.id}`,d)).status,200);ok('assignment rechecked under lock and on retries and reads');
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,c.token])for(const table of ['care_routine_revisions','care_routine_completions'])for(const method of ['GET','POST','PATCH','DELETE']){
   const row=table==='care_routine_revisions'?r1:canonical.id;const url=`${process.env.SUPABASE_URL}/rest/v1/${table}${method==='POST'?'':`?id=eq.${row}`}`;
   const r=await fetch(url,{method,headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:['POST','PATCH'].includes(method)?JSON.stringify(method==='POST'?{id:crypto.randomUUID()}:{id:row}):undefined});assert([401,403].includes(r.status),`Unexpected direct ${table} ${method}: ${r.status}`);
  }
  const protections=await db.query("select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated from pg_class c where c.oid in('care_routine_revisions'::regclass,'care_routine_completions'::regclass)");assert(protections.rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));ok('both new tables deny all direct Data API operations and retain RLS/grants');
  const mismatch=await db.query('select count(*) from care_routine_completions where "userId"=$1',[a.id]);assert.equal(Number(mismatch.rows[0].count),1);ok('exactly one daily completion stored');
 }finally{await cleanup();await db.end()}
 console.log(JSON.stringify({passed:true,checks:results.length,cleanup:true}));
})().catch(error=>{console.error('Routine live probe failed',error.code||error.message);process.exitCode=1});
