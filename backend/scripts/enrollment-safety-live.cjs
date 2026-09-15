// Loopback-only synthetic enrollment and safety contract probe. Cleanup uses recorded identities only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
require('dotenv').config({quiet:true});
const {local}=require('./recovery-drill.cjs');
const {unenrollFixture}=require('./lib/enrollment-fixture.cjs');
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3002/api';
local(base,['http:','https:']);local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
assert(process.env.SUPABASE_ANON_KEY,'SUPABASE_ANON_KEY is required');
assert(process.env.SUPABASE_SERVICE_ROLE_KEY,'SUPABASE_SERVICE_ROLE_KEY is required');
const db=new Client({connectionString:process.env.DATABASE_URL});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const run=crypto.randomUUID(),s={run,accounts:[]};
const state=path.resolve(process.env.ENROLLMENT_SAFETY_FIXTURE_STATE||`../.local/enrollment-safety-${run}.json`);
assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
const results=[];function ok(name){results.push(name);console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}}
const TABLES=['eligibility_screenings','consent_acceptances','care_decisions','urgent_reports'];
async function cleanup(){
 // Every step is isolated: one failing step must never skip the rest (auth-user, profile,
 // clinician deletion and the manifest unlink all still need to run), so we push failures
 // and only throw the first one after every step has been attempted. Revalidation gates
 // every later delete: an account that fails identity revalidation is never touched again.
 const cleanupErrors=[];
 const verified=[];
 for(const a of s.accounts){
  try{
   const {data,error}=await admin.auth.admin.getUserById(a.id);
   const identityOk=!error&&data.user.email===a.email&&a.email===`clearaf-enrollment-${s.run}-${a.role.toLowerCase()}@example.invalid`;
   assert(identityOk,`Identity mismatch for ${a.role}`);
   verified.push(a);
  }catch(error){cleanupErrors.push(error)}
 }
 const ids=verified.map(a=>a.id);
 const patientIds=verified.filter(a=>a.role.startsWith('patient')).map(a=>a.id);
 // Defence in depth: remove anything that might have landed at the fixed check-7 row ID in
 // any of the four tables, in case RLS/grants ever regressed and a write actually succeeded.
 // Keyed by the probe's own random id, not an account, so this always runs.
 if(s.rowId){
  for(const table of TABLES){
   try{await db.query(`delete from ${table} where id=$1::uuid`,[s.rowId])}catch(error){cleanupErrors.push(error)}
  }
 }
 try{await db.query('delete from urgent_reports where "patientId"=any($1::uuid[])',[patientIds])}catch(error){cleanupErrors.push(error)}
 try{await db.query('delete from care_decisions where "patientId"=any($1::uuid[])',[patientIds])}catch(error){cleanupErrors.push(error)}
 try{await unenrollFixture(db,ids)}catch(error){cleanupErrors.push(error)}
 try{await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[ids])}catch(error){cleanupErrors.push(error)}
 try{await db.query('delete from user_profiles where id=any($1::uuid[])',[ids])}catch(error){cleanupErrors.push(error)}
 try{await db.query('delete from dermatologists where id=any($1::uuid[])',[ids])}catch(error){cleanupErrors.push(error)}
 for(const a of verified){
  try{
   const removed=await admin.auth.admin.deleteUser(a.id);
   if(removed.error)throw removed.error;
  }catch(error){cleanupErrors.push(error)}
 }
 try{
  assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0,'Synthetic auth cleanup incomplete');
 }catch(error){cleanupErrors.push(error)}
 // Only remove the manifest once every step has actually succeeded; otherwise leave it in
 // place (still 0600) so a rerun or manual cleanup can finish by exact recorded identity.
 if(cleanupErrors.length)throw cleanupErrors[0];
 fs.unlinkSync(state);
 ok('recorded synthetic accounts, sessions, screenings, consents, decisions and reports removed');
}
(async()=>{
 await db.connect();save();
 try{
  // 0. Anonymous requests (no Authorization header) are refused before any lookup.
  for(const url of ['/enrollment','/care-decisions/current','/urgent-reports']){
   const anonymous=await call(url);assert.equal(anonymous.status,401,`Anonymous GET ${url}`);
   ok(`anonymous GET /api${url} refused with 401`);
  }
  for(const role of ['patientA','patientB','clinicianA','clinicianB']){
   const email=`clearaf-enrollment-${run}-${role.toLowerCase()}@example.invalid`,password=crypto.randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Enrollment Test'}});assert(!error,'Synthetic signup failed');
   const account={id:data.user.id,email,role};s.accounts.push(account);save();
   if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[account.id,'Synthetic Enrollment Clinician',email,'UNUSED_SUPABASE_AUTH']);
   const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');Object.defineProperty(account,'token',{value:login.data.session.access_token});
  }
  const [a,b,c,d]=s.accounts;
  await db.query('update user_profiles set "dermatologistId"=case when id=$1::uuid then $3::uuid else $4::uuid end,"onboardingCompleted"=true where id in($1::uuid,$2::uuid)',[a.id,b.id,c.id,d.id]);

  // 1. Screening required before enrollment; gated photo intent denies; ungated urgent report accepted.
  const captureId=crypto.randomUUID();
  const initial=await call('/enrollment',a);assert.equal(initial.status,200);assert.equal(initial.body.status,'screening_required');
  const consentVersion=initial.body.consent.version,consentSha256=initial.body.consent.sha256;
  const deniedPhoto=await call(`/photos/captures/${captureId}/upload-url`,a,'POST',{});assert.equal(deniedPhoto.status,403);assert.equal(deniedPhoto.body.code,'ENROLLMENT_REQUIRED');
  const firstReportId=crypto.randomUUID();
  const firstReport=await call(`/urgent-reports/${firstReportId}`,a,'PUT',{category:'pain_or_infection',description:'Synthetic pre-enrollment urgent symptom report'});assert.equal(firstReport.status,201);
  ok('screening required before enrollment, gated photo intent denied and ungated urgent report accepted');

  // 2. A screens eligible, accepts consent, unlocks the gated photo intent.
  const screeningIdA=crypto.randomUUID();
  const screenA=await call(`/enrollment/screenings/${screeningIdA}`,a,'PUT',{stateCode:'IL',dateOfBirth:'1990-01-01',pregnancyStatus:'none'});assert.equal(screenA.status,201);assert.equal(screenA.body.status,'consent_required');assert.equal(screenA.body.screening.eligible,true);
  const consentA=await call(`/enrollment/consents/${consentVersion}`,a,'PUT',{documentSha256:consentSha256});assert.equal(consentA.status,201);assert.equal(consentA.body.status,'enrolled');
  const allowedPhoto=await call(`/photos/captures/${captureId}/upload-url`,a,'POST',{});assert.equal(allowedPhoto.status,200);assert(allowedPhoto.body.signedUrl,'Expected signed upload URL after enrollment');
  assert.equal(new URL(allowedPhoto.body.signedUrl).hostname,new URL(process.env.SUPABASE_URL).hostname,'Signed upload escaped local Supabase');
  ok('eligible screening and consent acceptance enroll the patient and unlock the gated photo intent');

  // 3. B is ineligible (NON_US), waitlist is idempotent, consent is rejected before eligibility.
  const screeningIdB=crypto.randomUUID();
  const screenB=await call(`/enrollment/screenings/${screeningIdB}`,b,'PUT',{stateCode:'NON_US',dateOfBirth:'1990-01-01',pregnancyStatus:'none'});assert.equal(screenB.status,201);assert.equal(screenB.body.status,'ineligible');assert.deepEqual(screenB.body.screening.reasons,['state']);
  const waitlist1=await call('/enrollment/waitlist',b,'PUT',{screeningId:screeningIdB});assert.equal(waitlist1.status,200);
  const waitlist2=await call('/enrollment/waitlist',b,'PUT',{screeningId:screeningIdB});assert.equal(waitlist2.status,200);
  assert(waitlist1.body.screening.waitlistRequestedAt&&waitlist1.body.screening.waitlistRequestedAt===waitlist2.body.screening.waitlistRequestedAt,'Waitlist timestamp not idempotent');
  const consentB=await call(`/enrollment/consents/${consentVersion}`,b,'PUT',{documentSha256:consentSha256});assert.equal(consentB.status,409);assert.equal(consentB.body.code,'SCREENING_REQUIRED');
  ok('non-US screening ineligible for state, idempotent waitlist timestamp, consent rejected before eligibility');

  // 4. Clinician enrollment summary visibility.
  const summaryByC=await call(`/enrollment/patients/${a.id}`,c);assert.equal(summaryByC.status,200);assert.equal(summaryByC.body.status,'enrolled');assert.deepEqual(Object.keys(summaryByC.body.consent).sort(),['acceptedAt','version']);
  const summaryByD=await call(`/enrollment/patients/${a.id}`,d);assert.equal(summaryByD.status,404);
  ok('assigned clinician sees enrollment status without consent body, unassigned clinician denied');

  // 5. Care decisions with refund lifecycle.
  const decisionId=crypto.randomUUID();
  const decisionResp=await call(`/care-decisions/patients/${a.id}/decisions/${decisionId}`,c,'PUT',{decision:'refer_out',patientMessage:'Synthetic referral guidance for dermatology follow-up',photoId:null});assert.equal(decisionResp.status,201);assert.equal(decisionResp.body.decision.refundStatus,'pending');
  const currentDecision=await call('/care-decisions/current',a);assert.equal(currentDecision.status,200);assert.equal(currentDecision.body.decision.id,decisionId);
  const refundResp=await call(`/care-decisions/patients/${a.id}/decisions/${decisionId}/refund`,c,'PUT',{refundStatus:'issued'});assert.equal(refundResp.status,200);assert.equal(refundResp.body.decision.refundStatus,'issued');
  const deniedDecision=await call(`/care-decisions/patients/${a.id}/decisions/${crypto.randomUUID()}`,d,'PUT',{decision:'refer_out',patientMessage:null,photoId:null});assert.equal(deniedDecision.status,404);
  ok('assigned clinician records refer_out with refund lifecycle visible to the patient, unassigned clinician denied');

  // 6. Urgent report queue ordering, reassignment and resolution.
  // firstReportId (created in check 1, before A was enrolled) is reused here as the older
  // report: it gets acknowledged first, then resolved after reassignment.
  const secondReportId=crypto.randomUUID();
  const secondReport=await call(`/urgent-reports/${secondReportId}`,a,'PUT',{category:'rapid_worsening',description:'Synthetic worsening symptom follow-up report'});assert.equal(secondReport.status,201);
  const ack=await call(`/urgent-reports/${firstReportId}/acknowledge`,c,'POST',{});assert.equal(ack.status,200);assert.equal(ack.body.report.status,'acknowledged');
  const queueBeforeReassign=await call('/urgent-reports/queue',c);assert.equal(queueBeforeReassign.status,200);assert.equal(queueBeforeReassign.body.openCount,1);assert.deepEqual(queueBeforeReassign.body.data.map(r=>r.id),[secondReportId,firstReportId]);
  // Reassignment must always be reverted, even if a check below throws, so the fixture
  // is left in its original assignment shape for cleanup.
  await db.query('update user_profiles set "dermatologistId"=$2 where id=$1',[a.id,d.id]);
  try{
   const queueAfterReassignC=await call('/urgent-reports/queue',c);assert.equal(queueAfterReassignC.body.data.length,0);
   const queueAfterReassignD=await call('/urgent-reports/queue',d);assert.equal(queueAfterReassignD.body.data.length,2);
   const note='Synthetic resolution note after reassignment';
   const resolveResp=await call(`/urgent-reports/${firstReportId}/resolve`,d,'POST',{resolutionNote:note});assert.equal(resolveResp.status,200);assert.equal(resolveResp.body.report.status,'resolved');
   const mineA=await call('/urgent-reports',a);const resolved=mineA.body.data.find(r=>r.id===firstReportId);assert(resolved,'Resolved report missing from patient history');assert.equal(resolved.resolutionNote,note,'Resolution note mismatch');
  }finally{
   await db.query('update user_profiles set "dermatologistId"=$2 where id=$1',[a.id,c.id]);
  }
  ok('urgent queue orders open before acknowledged with correct open count, reassignment moves the queue, resolution note reaches the patient');

  // 7. Direct Data API denial for all four new tables.
  const rowId=crypto.randomUUID();s.rowId=rowId;save();
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,c.token])for(const table of TABLES)for(const method of ['GET','POST','PATCH','DELETE']){
   const url=`${process.env.SUPABASE_URL}/rest/v1/${table}${method==='GET'?'?select=id&limit=0':method==='POST'?'':`?id=eq.${rowId}`}`;
   const r=await fetch(url,{method,headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:['POST','PATCH'].includes(method)?JSON.stringify({id:rowId}):undefined});
   assert([401,403].includes(r.status),`Unexpected direct ${table} ${method}: ${r.status}`);
  }
  const protections=await db.query(`select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated from pg_class c where c.oid in(${TABLES.map(t=>`'${t}'::regclass`).join(',')})`);
  assert.equal(protections.rows.length,TABLES.length);assert(protections.rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));
  ok('all four enrollment and safety tables deny anonymous, patient and clinician direct Data API access and retain RLS/grants');
 }finally{try{await cleanup()}finally{await db.end()}}
 console.log(JSON.stringify({passed:true,checks:results.length,cleanup:true}));
})().catch(error=>{console.error('Enrollment and safety live probe failed',error.code==='ERR_ASSERTION'?error.message:(error.code||'operation failed'));process.exitCode=1});
