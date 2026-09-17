// Loopback-only synthetic worklist contract probe and UI fixture. Never prints credentials, names or free text.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
require('dotenv').config({quiet:true});
const {local}=require('./recovery-drill.cjs');
const {enrollFixture,unenrollFixture}=require('./lib/enrollment-fixture.cjs');
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3002/api';
local(base,['http:','https:']);local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
const db=new Client({connectionString:process.env.DATABASE_URL});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const keep=process.argv.includes('--keep-for-ui'),cleanupOnly=process.argv.includes('--cleanup-ui');
assert(!(keep&&cleanupOnly),'Choose one fixture mode');
const uiPassword=process.env.WORKLIST_UI_PASSWORD;
assert(!keep||(typeof uiPassword==='string'&&uiPassword.length>=20),'Set WORKLIST_UI_PASSWORD (20+ characters) to keep a UI fixture');
const run=crypto.randomUUID();let s={run,accounts:[]};
const state=path.resolve(process.env.WORKLIST_FIXTURE_STATE||((keep||cleanupOnly)?'../.local/worklist-ui.json':`../.local/worklist-${run}.json`));
if(cleanupOnly){s=JSON.parse(fs.readFileSync(state,'utf8'));assert(s.run&&Array.isArray(s.accounts),'Invalid fixture manifest')}else assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
let checks=0;function ok(name){checks++;console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}}
async function enrollPatients(patients){const r=await call('/enrollment',patients[0]);assert.equal(r.status,200,'Enrollment lookup failed');await enrollFixture(db,patients.map(a=>a.id),{rulesVersion:r.body.rulesVersion,documentVersion:r.body.consent.version,documentSha256:r.body.consent.sha256})}
const created=(r,label)=>assert([200,201].includes(r.status),`${label} failed with ${r.status}`);
async function cleanup(){
 for(const a of s.accounts){const {data,error}=await admin.auth.admin.getUserById(a.id);assert(a.email===`clearaf-worklist-${s.run}-${a.role.toLowerCase()}@example.invalid`&&!error&&data.user.email===a.email,'Fixture identity mismatch')}
 const ids=s.accounts.map(a=>a.id);
 await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[ids]);
 await db.query('delete from assigned_messages where "patientId"=any($1::uuid[])',[ids]);
 await db.query('delete from photo_reviews where "photoId" in(select id from skin_photos where "userId"=any($1::uuid[]))',[ids]);
 for(const [table,column] of [['urgent_reports','patientId'],['care_form_responses','userId'],['care_form_revisions','userId'],['care_routine_completions','userId'],['care_routine_revisions','userId'],['skin_photos','userId'],['photo_cleanup','userId']])
  await db.query(`delete from public.${table} where "${column}"=any($1::uuid[])`,[ids]);
 await unenrollFixture(db,ids);
 await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);
 await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
 for(const a of s.accounts)assert(!(await admin.auth.admin.deleteUser(a.id)).error,'Synthetic auth cleanup failed');
 assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0);
 fs.unlinkSync(state);ok('recorded synthetic accounts, sessions and care rows removed');
}
(async()=>{
 await db.connect();if(cleanupOnly){try{await cleanup()}finally{await db.end()}return}save();
 let retained=false;
 try{
  for(const role of ['patientA','patientB','patientC','clinicianA','clinicianB']){
   const email=`clearaf-worklist-${run}-${role.toLowerCase()}@example.invalid`;
   const password=keep&&role==='clinicianA'?uiPassword:crypto.randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Worklist Test'}});assert(!error,'Synthetic signup failed');
   const account={id:data.user.id,email,role};s.accounts.push(account);save();
   if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[account.id,'Synthetic Worklist Clinician',email,'UNUSED_SUPABASE_AUTH']);
   const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');
   Object.defineProperty(account,'token',{value:login.data.session.access_token});
  }
  const [a,b,c,ca,cb]=s.accounts;
  await enrollPatients([a,b,c]);
  for(const [patient,clinician,name] of [[a,ca,'Synthetic Ada Worklist'],[b,ca,'Synthetic Ben Worklist'],[c,cb,'Synthetic Cy Worklist']])
   await db.query('update user_profiles set "dermatologistId"=$2,name=$3 where id=$1',[patient.id,clinician.id,name]);
  const today=new Date().toISOString().slice(0,10);
  const offset=k=>new Date(Date.parse(`${today}T00:00:00.000Z`)-k*86_400_000).toISOString().slice(0,10);
  const wl=(query={},who=ca)=>call(`/worklist?${new URLSearchParams({localDate:today,...query})}`,who);

  const photo=async(owner,date)=>{const id=crypto.randomUUID();await db.query('insert into skin_photos(id,"userId","photoUrl","createdAt","captureDate") values($1,$2,$3,$4,$5)',[id,owner.id,`${owner.id}/${id}.jpg`,date,'2020-01-01']);return id};
  await photo(b,'2026-01-01');await photo(a,'2026-01-02');const reviewed=await photo(a,'2026-01-03');await photo(a,'2026-01-05');await photo(c,'2025-12-31');
  created(await call(`/photo-reviews/photos/${reviewed}`,ca,'PUT',{}),'Photo review');

  const routine=async(patient,timeOfDay)=>{const id=crypto.randomUUID();created(await call(`/routines/patients/${patient.id}/${timeOfDay}/revisions/${id}`,ca,'PUT',{expectedRevisionId:null,name:'Synthetic routine',isActive:true,steps:[{title:'Synthetic step',instructions:'Synthetic instructions'}]}),'Routine save');return id};
  const aMorning=await routine(a,'morning'),aEvening=await routine(a,'evening'),bMorning=await routine(b,'morning');
  await db.query(`update care_routine_revisions set "createdAt"=now()-interval '30 days' where "userId"=any($1::uuid[])`,[[a.id,b.id]]);
  const complete=async(patient,revisionId,date)=>created(await call(`/routines/completions/${crypto.randomUUID()}`,patient,'PUT',{revisionId,completedAt:`${date}T08:00:00.000Z`,localDate:date,timeZone:'UTC'}),'Completion');
  for(let k=1;k<=10;k++)await complete(a,aMorning,offset(k));
  for(let k=1;k<=5;k++)await complete(a,aEvening,offset(k));
  for(const k of [1,2])await complete(b,bMorning,offset(k));

  for(let i=0;i<2;i++)created(await call(`/assigned-messages/patients/${a.id}/clinicians/${ca.id}/messages/${crypto.randomUUID()}`,a,'PUT',{content:'Synthetic worklist message',reference:null}),'Message');
  const question={id:crypto.randomUUID(),prompt:'Synthetic prompt',type:'choice',required:true,options:[{id:crypto.randomUUID(),label:'First'},{id:crypto.randomUUID(),label:'Second'}]};
  const form=await call(`/care-support/patients/${a.id}/forms/${crypto.randomUUID()}`,ca,'PUT',{expectedRevisionId:null,title:'Synthetic form',isActive:true,questions:[question]});created(form,'Form save');
  created(await call(`/care-support/responses/${crypto.randomUUID()}`,a,'PUT',{formId:form.body.form.id,submittedAt:new Date().toISOString(),answers:[{questionId:question.id,optionId:question.options[0].id}]}),'Check-in');
  const reportId=crypto.randomUUID();created(await call(`/urgent-reports/${reportId}`,b,'PUT',{category:'other',description:'Synthetic worklist report'}),'Urgent report');

  assert.equal((await call(`/worklist?localDate=${today}`)).status,401);
  assert.equal((await wl({},a)).status,403);
  for(const query of [{localDate:'2026-02-30'},{filter:'urgent'},{limit:'51'},{page:'0'},{sort:'name'}])assert.equal((await wl(query)).status,400);
  assert.equal((await call('/worklist',ca)).status,400);
  ok('clinician role, strict query and required local date');

  const r=await wl();assert.equal(r.status,200);
  assert.deepEqual(r.body.data.map(p=>p.patientId),[b.id,a.id]);
  assert.deepEqual(r.body.pagination,{page:1,limit:20,total:2,totalPages:1});
  const rowA=r.body.data[1],rowB=r.body.data[0];
  assert.deepEqual(rowA.photos,{unreviewedCount:2,oldestUploadAt:'2026-01-02T00:00:00.000Z'});
  assert.deepEqual(r.body.summary.photosToReview,{count:3,oldestUploadAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(r.body.summary.assignedPatients,2);
  ok('needs review lists only assigned patients with unreviewed uploads, oldest upload first');

  const first=await wl({page:'1',limit:'1'}),second=await wl({page:'2',limit:'1'});
  assert.deepEqual(first.body.pagination,{page:1,limit:1,total:2,totalPages:2});
  assert.equal(first.body.data[0].patientId,b.id);assert.equal(second.body.data[0].patientId,a.id);
  ok('needs review paginates stably in review-queue order');

  assert.deepEqual(r.body.summary.unreadMessages,{count:2,patients:1});assert.equal(rowA.unreadMessages,2);
  assert.equal(r.body.summary.checkInsSubmitted.count,1);assert.equal(typeof rowA.latestCheckInAt,'string');
  ok('unread messages and submitted check-ins counted for assigned patients');

  assert.deepEqual([rowA.adherence.percent,rowA.adherence.completedDays,rowA.adherence.countedDays],[77,10,13]);
  assert.deepEqual(rowA.adherence.days.map(d=>d.routines),[0,0,0,1,1,1,1,1,2,2,2,2,2,null]);
  assert.equal(rowB.adherence.percent,15);assert.equal(r.body.summary.adherenceUnderThreshold.count,1);
  ok('adherence comes from recorded completions in the 14-day window');

  let flagged=await wl({filter:'flagged'});
  assert.deepEqual(flagged.body.data.map(p=>p.patientId),[b.id]);assert.equal(flagged.body.data[0].urgent.open,1);
  created(await call(`/urgent-reports/${reportId}/acknowledge`,ca,'POST',{}),'Acknowledge');
  flagged=await wl({filter:'flagged'});
  assert.deepEqual([flagged.body.data[0].urgent.open,flagged.body.data[0].urgent.acknowledged],[0,1]);
  created(await call(`/urgent-reports/${reportId}/resolve`,ca,'POST',{resolutionNote:null}),'Resolve');
  assert.equal((await wl({filter:'flagged'})).body.pagination.total,0);
  created(await call(`/urgent-reports/${crypto.randomUUID()}`,b,'PUT',{category:'rapid_worsening',description:'Synthetic worklist report'}),'Second urgent report');
  assert.equal((await wl({filter:'flagged'})).body.pagination.total,1);
  ok('flagged keeps open and seen reports until resolved');

  assert.deepEqual((await wl({filter:'all',search:'ada worklist'})).body.data.map(p=>p.patientId),[a.id]);
  assert.equal((await wl({filter:'all',search:'Cy Worklist'})).body.pagination.total,0);
  assert.equal((await wl({filter:'all'})).body.pagination.total,2);
  ok('all patients searches by name within the assignment only');

  const other=await wl({},cb);
  assert.deepEqual(other.body.data.map(p=>p.patientId),[c.id]);assert.equal(other.body.summary.assignedPatients,1);assert.equal(other.body.summary.unreadMessages.count,0);
  await db.query('update user_profiles set "dermatologistId"=$1 where id=$2',[cb.id,a.id]);
  const moved=await wl({filter:'all'});
  assert.deepEqual(moved.body.data.map(p=>p.patientId),[b.id]);assert.equal(moved.body.summary.unreadMessages.count,0);assert.equal(moved.body.summary.checkInsSubmitted.count,0);
  assert.ok((await wl({filter:'all'},cb)).body.data.some(p=>p.patientId===a.id));
  await db.query('update user_profiles set "dermatologistId"=$1 where id=$2',[ca.id,a.id]);
  ok('reassignment moves every count and row to the current clinician');

  if(keep){retained=true;save();console.log('Retained exact UI fixture manifest: '+state);console.log('UI clinician: '+ca.email)}
 }finally{if(!retained)await cleanup();await db.end()}
 console.log(JSON.stringify({passed:true,checks,cleanup:!retained}));
})().catch(error=>{const location=String(error.stack||'').split('\n').find(line=>line.includes('worklist-live.cjs:'));console.error('Worklist live probe failed',error.code||error.name,location?.trim()||'');process.exitCode=1});
