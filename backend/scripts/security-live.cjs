// Creates only uniquely named synthetic accounts; cleanup is limited to their IDs.
// Run from backend: node scripts/security-live.cjs prepare|verify|cleanup
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg');const{createClient}=require('@supabase/supabase-js');
const {enrollFixture,unenrollFixture}=require('./lib/enrollment-fixture.cjs');
require('dotenv').config({quiet:true});
const statePath=process.env.SECURITY_FIXTURE_STATE||'/tmp/clearaf-security-fixtures.json';
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3001/api';
for (const value of [base,process.env.SUPABASE_URL,process.env.DATABASE_URL]) {
 if (!value) throw Error('Configure explicit local test environment first');
 if (!['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname) && process.env.SECURITY_ALLOW_PRODUCTION !== 'true') throw Error('Nonlocal security tests require explicit SECURITY_ALLOW_PRODUCTION=true');
}
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const publicClient=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const db=new Client({connectionString:process.env.DATABASE_URL});
function save(s){fs.writeFileSync(statePath,JSON.stringify(s),{mode:0o600});fs.chmodSync(statePath,0o600)}
async function run(){
 await db.connect();const mode=process.argv[2];
 if(mode==='prepare'){
  assert(!fs.existsSync(statePath),'Existing fixture state must be cleaned up first');
  const s={run:crypto.randomUUID(),accounts:[],photoIds:[],paths:[]};save(s);
  for(const role of ['patientA','patientB','doctorA','doctorB']){
   const account={role,email:`clearaf-security-${s.run}-${role.toLowerCase()}@example.invalid`,password:crypto.randomBytes(30).toString('base64url')};
   const {data,error}=await admin.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,user_metadata:{name:'Synthetic Security Test'}});
   if(error)throw error;account.id=data.user.id;s.accounts.push(account);save(s);
   if(role.startsWith('doctor'))await db.query('insert into public.dermatologists (id,name,email,password,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now())',[account.id,'Synthetic Security Clinician',account.email,'UNUSED_SUPABASE_AUTH']);
   if(role.startsWith('patient')){
    const signIn=await publicClient().auth.signInWithPassword({email:account.email,password:account.password});
    if(signIn.error)throw signIn.error;
    const enrollmentResp=await fetch(base+'/enrollment',{headers:{Authorization:`Bearer ${signIn.data.session.access_token}`}});
    if(!enrollmentResp.ok)throw Error('Enrollment lookup failed: '+enrollmentResp.status);
    const enrollmentBody=await enrollmentResp.json();
    await enrollFixture(db,[account.id],{rulesVersion:enrollmentBody.rulesVersion,documentVersion:enrollmentBody.consent.version,documentSha256:enrollmentBody.consent.sha256});
   }
  }
  const [a,b,d,e]=s.accounts;await db.query('update public.user_profiles set "dermatologistId"=case when id=$1::uuid then $3::uuid else $4::uuid end where id in ($1::uuid,$2::uuid)',[a.id,b.id,d.id,e.id]);
  s.routineRevisionIds=[crypto.randomUUID()];s.routineCompletionIds=[crypto.randomUUID()];save(s);
  await db.query('insert into public.care_routine_revisions (id,"userId","timeOfDay",version,"createdBy",name,"isActive",steps) values ($1,$2,$3,1,$4,$5,true,$6)',[s.routineRevisionIds[0],a.id,'morning',d.id,'Synthetic recovery routine',JSON.stringify([{title:'Synthetic recovery step',instructions:'Synthetic fixture only'}])]);
  await db.query('insert into public.care_routine_completions (id,"userId","revisionId","completedAt","localDate","timeZone") values ($1,$2,$3,$4,$5,$6)',[s.routineCompletionIds[0],a.id,s.routineRevisionIds[0],'2026-01-01T12:00:00Z','2026-01-01','UTC']);
  console.log('Prepared four isolated synthetic accounts; auth trigger/profile creation passed.');
 }else if(mode==='verify'){
  const s=JSON.parse(fs.readFileSync(statePath));const [a,b,d,e]=s.accounts;
  for(const account of s.accounts){const{data,error}=await publicClient().auth.signInWithPassword({email:account.email,password:account.password});if(error)throw error;account.token=data.session.access_token;}
  const results=[];function ok(name){results.push(name);console.log('PASS '+name)}
  async function call(path,account,method='GET',body){const r=await fetch(base+path,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`}:{}) ,...(body&&! (body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return r}
  assert.equal((await call('/photos')).status,401);ok('anonymous API access denied');
  assert.equal((await call('/users/profile',a)).status,200);ok('patient authenticated profile access');
  const dr=await call('/users/profile',d);assert.equal(dr.status,200);assert.equal((await dr.json()).user.userType,'dermatologist');ok('clinician role resolved from trusted database');
  for(const account of [a,d])assert.equal((await call('/users/assign-dermatologist',account,'POST',{patientId:b.id,dermatologistId:d.id})).status,403);ok('client reassignment denied');
  assert.equal((await call('/auth/sync-profile',a,'POST',{})).status,200);const assignment=await db.query('select "dermatologistId" from user_profiles where id=$1',[a.id]);assert.equal(assignment.rows[0].dermatologistId,d.id);ok('profile sync preserves assignment');
  assert.equal((await call('/prescriptions',e,'POST',{patientId:a.id,medicationName:'Synthetic only',dosage:'test',instructions:'test'})).status,404);ok('unassigned prescription denied');
  const legacyCount=async()=>Number((await db.query('select count(*) from public.messages where "senderId"=any($1::text[]) or "recipientId"=any($1::text[])',[s.accounts.map(account=>account.id)])).rows[0].count);
  const beforeLegacy=await legacyCount();
  for(const clinician of [d,e]){const retired=await call('/messages/reply',clinician,'POST',{patientId:a.id,content:'Synthetic only'});assert.equal(retired.status,410);assert.equal((await retired.json()).code,'MESSAGE_OPERATION_RETIRED')}
  assert.equal(await legacyCount(),beforeLegacy);ok('legacy replies retired for assigned and unrelated clinicians without writes');
  const form=new FormData();form.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'synthetic.png');form.set('notes','Synthetic security verification; remove after test.');
  const upload=await call('/photos/upload',a,'POST',form);assert.equal(upload.status,201,'upload failed: '+upload.status);const photo=(await upload.json()).photo;s.photoIds.push(photo.id);s.paths.push(photo.storagePath);save({...s,accounts:s.accounts.map(({token,...x})=>x)});ok('patient upload stored successfully');
  assert.match(photo.photoUrl,/\/object\/sign\//);assert.equal((await fetch(photo.photoUrl)).status,200);ok('authorized signed image downloads');
  const owner=await call('/photos/'+photo.id,a);assert.equal(owner.status,200);assert.equal(owner.headers.get('cache-control'),'no-store');ok('owner photo access; no-store response');
  assert.equal((await call('/photos/'+photo.id,b)).status,404);assert.equal((await call('/photos/'+photo.id,b,'PATCH',{notes:'not allowed'})).status,404);assert.equal((await call('/photos/'+photo.id,b,'DELETE')).status,404);ok('other patient read/edit/delete denied');
  assert.equal((await call('/photos/patient/'+a.id,e)).status,404);ok('unassigned clinician photo list denied');
  const assigned=await call('/photos/patient/'+a.id,d);assert.equal(assigned.status,200);const gallery=await assigned.json();assert(gallery.data.some(p=>p.id===photo.id));assert.equal((await fetch(gallery.data.find(p=>p.id===photo.id).photoUrl)).status,200);ok('assigned clinician can retrieve shared photo');
  const listed=await call('/users/patients?page=1&limit=20',d);assert.equal(listed.status,200);const listedBody=await listed.json();
  assert(listedBody.patients.some(p=>p.id===a.id));assert(listedBody.patients.length<=20);assert.equal(listedBody.pagination.limit,20);
  for(const patient of listedBody.patients)for(const excluded of ['skinPhotos','appointments','prescriptions','photoUrl'])assert.equal(excluded in patient,false);
  ok('assigned patient list is bounded metadata without embedded private originals');
  const intent=await call('/photos/upload-url',a,'POST',{mimeType:'image/png'});assert.equal(intent.status,200);const uploadIntent=await intent.json();assert(uploadIntent.storagePath.startsWith(a.id+'/'));
  const largeImage=Buffer.alloc(5*1024*1024);Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=','base64').copy(largeImage);
  s.paths.push(uploadIntent.storagePath);save({...s,accounts:s.accounts.map(({token,...x})=>x)});
  const put=await fetch(uploadIntent.signedUrl,{method:'PUT',headers:{'Content-Type':'image/png'},body:largeImage});assert.equal(put.status,200);ok('5 MB synthetic image uploaded directly to private Storage');
  assert.equal((await call('/photos/complete-upload',b,'POST',{storagePath:uploadIntent.storagePath})).status,400);ok('another patient cannot finalize uploaded object');
  const beforeScore=await db.query('select "streakCount" from user_profiles where id=$1',[a.id]);
  const completions=await Promise.all([1,2].map(()=>call('/photos/complete-upload',a,'POST',{storagePath:uploadIntent.storagePath,skinScore:42,notes:'Synthetic large upload verification'})));
  assert.deepEqual(completions.map(r=>r.status).sort(),[200,201]);
  const completed=await Promise.all(completions.map(r=>r.json()));assert.equal(completed[0].photo.id,completed[1].photo.id);
  const largePhoto=completed[0].photo;s.photoIds.push(largePhoto.id);save({...s,accounts:s.accounts.map(({token,...x})=>x)});
  const afterScore=await db.query('select "streakCount", "currentSkinScore" from user_profiles where id=$1',[a.id]);
  assert.equal(afterScore.rows[0].streakCount,beforeScore.rows[0].streakCount+1);assert.equal(afterScore.rows[0].currentSkinScore,42);ok('concurrent completion creates one photo and applies score once');
  const repeated=await call('/photos/complete-upload',a,'POST',{storagePath:uploadIntent.storagePath});assert.equal(repeated.status,200);assert.equal((await repeated.json()).photo.id,largePhoto.id);ok('direct upload finalizes once and repeat completion is idempotent');
  const largeGallery=await call('/photos/patient/'+a.id,d);assert((await largeGallery.json()).data.some(p=>p.id===largePhoto.id));ok('assigned clinician sees large direct upload');
  // Data API privileges are tested with no real rows selected or changed.
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,d.token])for(const table of ['_prisma_migrations','appointments','care_routine_revisions','care_routine_completions','dermatologists','messages','prescriptions','products','routine_steps','routines','skin_photos','subscriptions','user_profiles']){
   const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`,{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});assert([401,403].includes(r.status),`direct ${table} access: ${r.status}`);
  }ok('all 13 tables deny anonymous, patient and clinician direct reads');
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,d.token])for(const method of ['POST','PATCH','DELETE']){
   const url=`${process.env.SUPABASE_URL}/rest/v1/skin_photos${method==='POST'?'':`?id=eq.${photo.id}`}`;
   const r=await fetch(url,{method,headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(method==='POST'?{id:crypto.randomUUID(),userId:a.id,photoUrl:'synthetic'}:{notes:'must not update'})});assert([401,403].includes(r.status),`direct write ${method}: ${r.status}`);
  }ok('anonymous/patient/clinician direct create, update and delete denied');
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,d.token])for(const [table,rowId] of [['care_routine_revisions',s.routineRevisionIds[0]],['care_routine_completions',s.routineCompletionIds[0]]])for(const method of ['POST','PATCH','DELETE']){
   const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${method==='POST'?'':`?id=eq.${rowId}`}`,{method,headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify({id:method==='POST'?crypto.randomUUID():rowId})});assert([401,403].includes(r.status),`direct routine write ${method}: ${r.status}`);
  }ok('routine revision and completion direct writes denied for all client roles');

  const legacy=`${process.env.SUPABASE_URL}/storage/v1/object/public/patient-photos/${photo.storagePath}`;assert.notEqual((await fetch(legacy)).status,200);ok('public photo URL cannot download private object');
  for(const account of [undefined,a,b,d]){
   const c=account?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${account.token}`}},auth:{persistSession:false}}):publicClient();
   const {data:list}=await c.storage.from('patient-photos').list(a.id);assert(!list?.length,'direct listing exposed objects');
   const{error:downloadError}=await c.storage.from('patient-photos').download(photo.storagePath);assert(downloadError,'direct download succeeded');
   const{error:writeError}=await c.storage.from('patient-photos').upload(`${a.id}/denied-${crypto.randomUUID()}.png`,Buffer.from('synthetic'),{contentType:'image/png'});assert(writeError,'direct upload succeeded');
   await c.storage.from('patient-photos').remove([photo.storagePath]);const{error:stillThere}=await admin.storage.from('patient-photos').info(photo.storagePath);assert(!stillThere,'unauthorized delete removed object');
  }ok('direct storage list/read/upload/delete blocked for client roles');
  const {data:short,error:shortError}=await admin.storage.from('patient-photos').createSignedUrl(photo.storagePath,1);assert(!shortError);await new Promise(r=>setTimeout(r,2200));assert.notEqual((await fetch(short.signedUrl)).status,200);ok('expired signed URL denied');
  const deletion=await call('/photos/'+photo.id,a,'DELETE');assert.equal(deletion.status,200);const{error:missing}=await admin.storage.from('patient-photos').info(photo.storagePath);assert(missing);ok('owner deletion removes stored object');
  const logout=await admin.auth.admin.signOut(b.token,'global');assert(!logout.error);assert.equal((await call('/users/profile',b)).status,401);ok('revoked session JWT cannot access API');
  const extra=await admin.auth.admin.createUser({email:`clearaf-security-${s.run}-postmigration@example.invalid`,password:crypto.randomBytes(32).toString('hex'),email_confirm:true});assert(!extra.error);const profileCreated=await db.query('select exists(select 1 from public.user_profiles where id=$1) as present',[extra.data.user.id]);assert(profileCreated.rows[0].present);await admin.auth.admin.deleteUser(extra.data.user.id);await db.query('delete from public.user_profiles where id=$1',[extra.data.user.id]);ok('signup profile trigger works after permission hardening');
  fs.mkdirSync('../.local',{recursive:true});fs.writeFileSync('../.local/live-verification.json' ,JSON.stringify({date:new Date().toISOString(),api:base,passed:results},null,2));
 }else if(mode==='cleanup'){
  if(!fs.existsSync(statePath)){console.log('No fixture state to clean');return}
  const s=JSON.parse(fs.readFileSync(statePath));assert(s.run&&s.accounts.every(a=>a.email.startsWith(`clearaf-security-${s.run}-`)),'Invalid fixture identity');
  if(s.paths.length){const{error}=await admin.storage.from('patient-photos').remove(s.paths);if(error)throw error}
  for(const a of s.accounts){const{data,error}=await admin.auth.admin.getUserById(a.id);if(error||data.user.email!==a.email)throw Error('Fixture identity mismatch; cleanup stopped')}
  const ids=s.accounts.map(a=>a.id);
  await db.query('delete from public.care_routine_completions where id=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.routineCompletionIds||[],ids]);
  await db.query('delete from public.care_routine_revisions where id=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.routineRevisionIds||[],ids]);
  await db.query('delete from public.user_profiles where name=$1 and not exists(select 1 from auth.users where auth.users.id=user_profiles.id)',[`clearaf-security-${s.run}-postmigration@example.invalid`]);
  await db.query('delete from public.skin_photos where "userId"=any($1::uuid[])',[ids]);
  await db.query('delete from public.messages where "senderId"=any($1::text[]) or "recipientId"=any($1::text[])',[ids]);
  await db.query('delete from public.prescriptions where "patientId"=any($1::uuid[])',[ids]);
  await db.query('delete from public.urgent_reports where "patientId"=any($1::uuid[])',[ids]);
  await db.query('delete from public.care_decisions where "patientId"=any($1::uuid[])',[ids]);
  await unenrollFixture(db,ids);
  await db.query('delete from public.user_profiles where id=any($1::uuid[])',[ids]);
  await db.query('delete from public.dermatologists where id=any($1::uuid[])',[ids]);
  for(const a of s.accounts){const{error}=await admin.auth.admin.deleteUser(a.id);if(error)throw error}
  fs.unlinkSync(statePath);console.log('Removed only this run’s synthetic accounts, rows and objects.');
 }else throw Error('Expected prepare|verify|cleanup');
}
run().catch(e=>{console.error('Verification failed:',e.code||e.message);process.exitCode=1}).finally(()=>db.end());
