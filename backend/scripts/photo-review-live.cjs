// Loopback-only synthetic photo review contract probe. Cleanup uses recorded identities only.
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
const run=crypto.randomUUID();let s={run,accounts:[],photoIds:[],objects:[]};
const state=path.resolve(process.env.PHOTO_REVIEW_FIXTURE_STATE||((keep||cleanupOnly)?'../.local/photo-review-ui.json':`../.local/photo-review-${run}.json`));
if(cleanupOnly){s=JSON.parse(fs.readFileSync(state,'utf8'));assert(s.run&&Array.isArray(s.accounts)&&Array.isArray(s.photoIds),'Invalid fixture manifest')}else assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
function id(kind){const value=crypto.randomUUID();s[kind].push(value);save();return value}
const results=[];function ok(name){results.push(name);console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+'/photo-reviews'+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}}
async function cleanup(){
 for(const a of s.accounts){const {data,error}=await admin.auth.admin.getUserById(a.id);assert(!error&&data.user.email===a.email,'Fixture identity mismatch')}
 const ids=s.accounts.map(a=>a.id);
 await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[ids]);
 for(const object of s.objects||[]){assert(ids.includes(object.split('/')[0])&&s.photoIds.includes(object.split('/')[1]?.replace('.jpg','')),'Unowned object');const result=await admin.storage.from('patient-photos').remove([object]);assert(!result.error,'Object cleanup failed')}

 await db.query('delete from photo_cleanup where "photoId"=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.photoIds,ids]);
 await db.query('delete from photo_reviews where "photoId"=any($1::uuid[])',[s.photoIds]);
 await db.query('delete from skin_photos where id=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.photoIds,ids]);
 await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);
 await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
 for(const a of s.accounts){assert(!(await admin.auth.admin.deleteUser(a.id)).error)}
 assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0);
 fs.unlinkSync(state);ok('recorded synthetic accounts, photos and reviews removed');
}
(async()=>{
 await db.connect();if(cleanupOnly){try{await cleanup()}finally{await db.end()}return}save();
 let retained=false;
 try{
  for(const role of ['patientA','patientB','clinicianA','clinicianB']){
   const email=`clearaf-photo-review-${run}-${role.toLowerCase()}@example.invalid`,password=crypto.randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Review Test'}});assert(!error,'Synthetic signup failed');
   const account={id:data.user.id,email,role,...(keep?{password}:{})};s.accounts.push(account);save();
   if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[account.id,'Synthetic Review Clinician',email,'UNUSED_SUPABASE_AUTH']);
   const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');Object.defineProperty(account,'token',{value:login.data.session.access_token});
  }
  const [a,b,c,d]=s.accounts;
  await db.query('update user_profiles set "dermatologistId"=case when id=$1::uuid then $3::uuid else $4::uuid end where id in($1::uuid,$2::uuid)',[a.id,b.id,c.id,d.id]);
  const photos=[];
  for(const [owner,date] of [[a,'2026-01-01'],[a,'2026-01-03'],[b,'2026-01-02']]){
   const photo=id('photoIds');photos.push(photo);await db.query('insert into skin_photos(id,"userId","photoUrl","createdAt","captureDate") values($1,$2,$3,$4,$5)',[photo,owner.id,`${owner.id}/${photo}.jpg`,date,'2020-01-01']);
  }
  const mark=(photo=photos[0],who=c,body={})=>call(`/photos/${photo}`,who,'PUT',body);
  const status=(ids=photos.slice(0,2),who=a)=>call(`/status?photoIds=${ids.join(',')}`,who);
  assert.equal((await call('/queue')).status,401);assert.equal((await mark(photos[0],a)).status,403);assert.equal((await mark(photos[0],d)).status,404);
  assert.equal((await status([photos[0]],b)).status,404);assert.equal((await status(photos,a)).status,404);assert.equal((await status([photos[0]],d)).status,404);assert.deepEqual((await status()).body,{reviews:[]});
  for(const ids of ['', 'invalid',photos[0]+','+photos[0],photos[0]+','])assert.equal((await call('/status?photoIds='+ids,a)).status,400);
  assert.equal((await mark(photos[0],c,{reviewerId:d.id})).status,400);assert.equal((await call('/queue?limit=51',c)).status,400);assert.equal((await call('/queue',a)).status,403);ok('roles, full batch ownership, strict input and no inferred review');
  let queue=await call('/queue',c);assert.equal(queue.status,200);assert.equal(queue.body.pagination.total,1);assert.equal(queue.body.data[0].patientId,a.id);assert.equal(queue.body.data[0].unreviewedCount,2);assert.equal(queue.body.data[0].oldestUploadAt,'2026-01-01T00:00:00.000Z');
  // Assign the second fixture to test grouped queue ordering and pagination.
  await db.query('update user_profiles set "dermatologistId"=$1 where id=$2',[c.id,b.id]);
  const first=await call('/queue?page=1&limit=1',c),second=await call('/queue?page=2&limit=1',c);
  assert.deepEqual(first.body.pagination,{page:1,limit:1,total:2,totalPages:2});assert.equal(first.body.data[0].patientId,a.id);assert.equal(second.body.data[0].patientId,b.id);ok('queue groups patients, uses upload date and paginates stably');
  const races=await Promise.all([mark(),mark()]);assert.deepEqual(races.map(r=>r.status).sort(),[200,201]);assert.deepEqual(races[0].body,races[1].body);const canonical=races[0].body.review;
  const deletion=await fetch(base+'/photos/'+photos[0],{method:'DELETE',headers:{Authorization:`Bearer ${a.token}`}});assert.equal(deletion.status,409);
  assert.deepEqual((await mark()).body.review,canonical);assert.deepEqual((await status()).body.reviews,[canonical]);assert.equal((await call('/queue',c)).body.data.find(p=>p.patientId===a.id).unreviewedCount,1);ok('concurrent and repeated acknowledgement immutable and patient visible');
  const locker=new Client({connectionString:process.env.DATABASE_URL});await locker.connect();
  try{await locker.query('begin');await locker.query('select id from user_profiles where id=$1 for update',[a.id]);await locker.query('update user_profiles set "dermatologistId"=$1 where id=$2',[d.id,a.id]);const pending=mark(photos[1]);await new Promise(r=>setTimeout(r,100));await locker.query('commit');assert.equal((await pending).status,404)}finally{await locker.query('rollback');await locker.end()}
  assert.equal((await mark()).status,404);assert.equal((await status([photos[0]],c)).status,404);assert.deepEqual((await mark(photos[0],d)).body.review,canonical);assert.deepEqual((await status([photos[0]],d)).body.reviews,[canonical]);assert.equal((await mark(photos[1],d)).status,201);assert.equal((await call('/queue',d)).body.pagination.total,0);ok('assignment rechecked under lock; historical author survives reassignment');
  for(const token of [process.env.SUPABASE_ANON_KEY,a.token,c.token])for(const table of ['photo_reviews','photo_cleanup'])for(const method of ['GET','POST','PATCH','DELETE']){
   const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${method==='POST'?'':`?photoId=eq.${photos[0]}`}`,{method,headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:['POST','PATCH'].includes(method)?JSON.stringify(table==='photo_reviews'?{photoId:photos[0],reviewerId:c.id}:{photoId:photos[0],userId:a.id,photoUrl:`${a.id}/${photos[0]}.jpg`}):undefined});assert([401,403].includes(r.status),`Unexpected Data API ${table} ${method}: ${r.status}`);
  }
  const protection=(await db.query("select relrowsecurity,has_table_privilege('anon','public.photo_reviews','SELECT,INSERT,UPDATE,DELETE') as anon,has_table_privilege('authenticated','public.photo_reviews','SELECT,INSERT,UPDATE,DELETE') as authenticated from pg_class where oid='public.photo_reviews'::regclass")).rows[0];assert(protection.relrowsecurity&&!protection.anon&&!protection.authenticated);ok('RLS enabled and direct Data API read/write denied');
  const deleting=id('photoIds');
  await db.query('insert into skin_photos(id,"userId","photoUrl") values($1,$2,$3)',[deleting,a.id,`${a.id}/${deleting}.jpg`]);
  const deletePhoto=(photo,who=a)=>fetch(base+'/photos/'+photo,{method:'DELETE',headers:{Authorization:`Bearer ${who.token}`}});
  assert.equal((await deletePhoto(deleting)).status,200);
  assert.equal(Number((await db.query('select count(*) from skin_photos where id=$1',[deleting])).rows[0].count),0);
  assert.equal(Number((await db.query('select count(*) from photo_cleanup where "photoId"=$1',[deleting])).rows[0].count),0);
  // Reproduce a committed cleanup intent awaiting retry (e.g. process stopped after commit).
  await db.query('insert into photo_cleanup("photoId","userId","photoUrl") values($1,$2,$3)',[deleting,a.id,`${a.id}/${deleting}.jpg`]);
  assert.equal((await deletePhoto(deleting,b)).status,404);assert.equal((await deletePhoto(deleting)).status,200);
  assert.equal(Number((await db.query('select count(*) from photo_cleanup where "photoId"=$1',[deleting])).rows[0].count),0);
  const cleanupProtection=(await db.query("select relrowsecurity,has_table_privilege('anon','public.photo_cleanup','SELECT,INSERT,UPDATE,DELETE') as anon,has_table_privilege('authenticated','public.photo_cleanup','SELECT,INSERT,UPDATE,DELETE') as authenticated from pg_class where oid='public.photo_cleanup'::regclass")).rows[0];assert(cleanupProtection.relrowsecurity&&!cleanupProtection.anon&&!cleanupProtection.authenticated);ok('deletion commits intent; owned retry completes; cleanup table inaccessible');
  if(keep){
   const jpeg=await require('sharp')({create:{width:600,height:600,channels:3,background:'#e4e0db'}}).jpeg().toBuffer();
   for(const photo of photos.slice(0,2)){const object=`${a.id}/${photo}.jpg`;s.objects.push(object);save();const upload=await admin.storage.from('patient-photos').upload(object,jpeg,{contentType:'image/jpeg'});assert(!upload.error,'Neutral fixture upload failed')}
   await db.query('update user_profiles set name=$1 where id=$2',['Synthetic Photo Review Patient',a.id]);
   await db.query('delete from photo_reviews where "photoId"=$1',[photos[1]]);
   s.ui={patientId:a.id,clinicianId:d.id,photoIds:photos.slice(0,2)};save();retained=true;ok('private neutral images and exact UI manifest retained');
  }
 }finally{if(!retained)await cleanup();await db.end()}
 console.log(JSON.stringify({passed:true,checks:results.length,cleanup:!retained}));
})().catch(error=>{console.error('Photo review live probe failed',error.code==='ERR_ASSERTION'?error.message:(error.code||'operation failed'));process.exitCode=1});
