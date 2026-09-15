// Loopback synthetic contract/UI fixture only. Never prints credentials or message bodies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const backendRequire=require('node:module').createRequire(path.resolve(__dirname,'../backend/package.json'));
const {Client}=backendRequire('pg'),{createClient}=backendRequire('@supabase/supabase-js');
backendRequire('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
const {local}=require('../backend/scripts/recovery-drill.cjs');
const {enrollFixture,unenrollFixture}=require('../backend/scripts/lib/enrollment-fixture.cjs');
const base=process.env.SECURITY_API_URL||'http://127.0.0.1:3002/api';
local(base,['http:','https:']);local(process.env.DATABASE_URL,['postgres:','postgresql:']);local(process.env.SUPABASE_URL,['http:','https:']);
const db=new Client({connectionString:process.env.DATABASE_URL});
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const keep=process.argv.includes('--keep-for-ui'),cleanupOnly=process.argv.includes('--cleanup-ui');assert(!(keep&&cleanupOnly),'Choose one fixture mode');
const run=crypto.randomUUID();let s={run,accounts:[],objects:[]};
const state=path.resolve(process.env.ASSIGNED_MESSAGES_FIXTURE_STATE||path.join(__dirname,'../.local',keep||cleanupOnly?'assigned-messages-ui.json':`assigned-messages-${run}.json`));
if(cleanupOnly){s=JSON.parse(fs.readFileSync(state,'utf8'));assert(s.run&&Array.isArray(s.accounts)&&Array.isArray(s.objects),'Invalid fixture manifest')}else assert(!fs.existsSync(state),'Refusing existing fixture file');
fs.mkdirSync(path.dirname(state),{recursive:true,mode:0o700});
function save(){fs.writeFileSync(state,JSON.stringify(s),{mode:0o600});fs.chmodSync(state,0o600)}
let checks=0;function ok(name){checks++;console.log('PASS '+name)}
async function call(url,account,method='GET',body){const r=await fetch(base+url,{method,headers:{...(account?{Authorization:`Bearer ${account.token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({}))}}
async function enrollPatients(patientAccounts){const enrolled=await call('/enrollment',patientAccounts[0]);assert.equal(enrolled.status,200,'Enrollment lookup failed');await enrollFixture(db,patientAccounts.map(a=>a.id),{rulesVersion:enrolled.body.rulesVersion,documentVersion:enrolled.body.consent.version,documentSha256:enrolled.body.consent.sha256})}
async function cleanup(){
 for(const a of s.accounts){const {data,error}=await admin.auth.admin.getUserById(a.id);assert(a.email===`clearaf-messages-${s.run}-${a.role.toLowerCase()}@example.invalid`&&!error&&data.user.email===a.email,'Fixture identity mismatch')}
 const ids=s.accounts.map(a=>a.id);
 for(const object of s.objects){assert(ids.some(id=>object.startsWith(id+'/'))&&!object.includes('..'),'Invalid owned object');assert(!(await admin.storage.from('patient-photos').remove([object])).error,'Synthetic object cleanup failed')}
 await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[ids]);
 for(const [table,column] of [['assigned_messages','patientId'],['photo_reviews','photoId']]){if(table==='photo_reviews')await db.query('delete from photo_reviews where "photoId" in(select id from skin_photos where "userId"=any($1::uuid[]))',[ids]);else await db.query(`delete from ${table} where "${column}"=any($1::uuid[])`,[ids])}
 for(const [table,column] of [['care_routine_completions','userId'],['care_routine_revisions','userId'],['skin_photos','userId'],['photo_cleanup','userId']])await db.query(`delete from ${table} where "${column}"=any($1::uuid[])`,[ids]);
 await unenrollFixture(db,ids);
 await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
 for(const a of s.accounts)assert(!(await admin.auth.admin.deleteUser(a.id)).error,'Synthetic auth cleanup failed');
 assert.equal(Number((await db.query('select count(*) from auth.users where id=any($1::uuid[])',[ids])).rows[0].count),0);fs.unlinkSync(state);ok('exact synthetic owners, sessions, messages and references cleaned');
}
(async()=>{await db.connect();if(cleanupOnly){try{await cleanup()}finally{await db.end()}return}save();let retained=false;try{
 for(const role of ['patientA','patientB','clinicianA','clinicianB']){
  const email=`clearaf-messages-${run}-${role.toLowerCase()}@example.invalid`,password=crypto.randomBytes(30).toString('base64url');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Synthetic Messaging Test'}});assert(!error,'Synthetic signup failed');
  const a={id:data.user.id,email,role,...(keep?{password}:{})};s.accounts.push(a);save();
  if(role.startsWith('clinician'))await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[a.id,'Synthetic Messaging Clinician',email,'UNUSED_SUPABASE_AUTH']);
  const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Synthetic login failed');Object.defineProperty(a,'token',{value:login.data.session.access_token});
 }
 const [a,b,c,d]=s.accounts;await enrollPatients([a,b]);await db.query('update user_profiles set "dermatologistId"=case when id=$1::uuid then $3::uuid else $4::uuid end,"onboardingCompleted"=true where id in($1::uuid,$2::uuid)',[a.id,b.id,c.id,d.id]);
 const pair=`/patients/${a.id}/clinicians/${c.id}`,msg=(url,who=a,method='GET',body)=>call('/assigned-messages'+url,who,method,body),send=(id,who=a,content='Synthetic messaging example',reference=null)=>msg(pair+'/messages/'+id,who,'PUT',{content,reference});
 assert.equal((await msg('/current',null)).status,401);assert.equal((await msg('/current',c)).status,403);assert.equal((await msg('/inbox',a)).status,403);assert.equal((await msg(pair,b)).status,404);assert.equal((await msg(pair,d)).status,404);
 assert.equal((await msg('/current')).body.conversation.patientId,a.id);const inbox=await msg('/inbox?limit=1',c);assert.equal(inbox.body.conversations[0].patientId,a.id);assert.equal(inbox.body.conversations[0].lastMessage,null);ok('verified identities, roles, empty assigned inbox and unrelated-pair denial');
 const first=crypto.randomUUID();assert.deepEqual((await Promise.all([send(first),send(first)])).map(r=>r.status).sort(),[200,201]);assert.equal((await send(first,a,'Changed')).status,409);assert.equal((await send(first,c)).status,409);
 const ids=[first];for(let i=0;i<4;i++){const id=crypto.randomUUID();ids.push(id);assert.equal((await send(id)).status,201)}
 await db.query('update assigned_messages set "sentAt"=$2 where "patientId"=$1',[a.id,'2026-09-13T00:00:00.000Z']);
 let cursor=null,loaded=[];do{const page=await msg(pair+'?limit=2'+(cursor?'&before='+cursor:''),c);assert.equal(page.status,200);assert.equal(page.body.conversation.unreadCount,5);loaded.push(...page.body.messages.map(m=>m.id));cursor=page.body.nextCursor}while(cursor);assert.deepEqual(loaded,[...ids].sort().reverse());
 const bound=(await msg(pair+'?limit=1',c)).body.nextCursor;assert.equal((await msg(`/patients/${b.id}/clinicians/${d.id}?before=${bound}`,d)).status,400);ok('concurrent stable UUID replay, conflict and bounded tied-timestamp cursor');
 const reply=crypto.randomUUID();assert.equal((await send(reply,c,'Synthetic clinician reply')).status,201);assert.equal((await msg(pair+'/read',c,'POST',{messageIds:[first,reply]})).status,404);assert.equal((await msg(pair,c)).body.conversation.unreadCount,5);assert.equal((await msg(pair+'/read',a,'POST',{messageIds:[first]})).status,404);assert.equal((await msg(pair+'/read',c,'POST',{messageIds:[first]})).body.unreadCount,4);assert.equal((await msg(pair+'/read',c,'POST',{messageIds:[first]})).body.unreadCount,4);assert.equal((await msg(pair+'/read',a,'POST',{messageIds:[reply]})).body.unreadCount,0);ok('received exact IDs acknowledged atomically, idempotently, with remaining unread history');
 const routine=crypto.randomUUID();assert.equal((await call(`/routines/patients/${a.id}/morning/revisions/${routine}`,c,'PUT',{expectedRevisionId:null,name:'Synthetic linked routine',isActive:true,steps:[{title:'Example step',instructions:'Example instruction'}]})).status,201);
 const linked=crypto.randomUUID();assert.equal((await send(linked,c,'Synthetic routine feedback',{type:'routineRevision',id:routine})).status,201);const detail=await msg(pair+'/messages/'+linked+'/reference');assert.equal(detail.body.routine.id,routine);assert.equal(detail.body.reference.available,true);assert.equal((await send(crypto.randomUUID(),a,'Text',{type:'routineRevision',id:routine})).status,403);
 assert.equal((await msg(`/patients/${b.id}/clinicians/${d.id}/messages/${crypto.randomUUID()}`,d,'PUT',{content:'Text',reference:{type:'routineRevision',id:routine}})).status,404);
 const photo=crypto.randomUUID(),object=a.id+'/'+crypto.randomUUID()+'.png';s.objects.push(object);save();const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');assert(!(await admin.storage.from('patient-photos').upload(object,bytes,{contentType:'image/png'})).error,'Synthetic photo upload failed');
 await db.query('insert into skin_photos(id,"userId","photoUrl") values($1,$2,$3)',[photo,a.id,object]);const photoMessage=crypto.randomUUID();assert.equal((await send(photoMessage,c,'Synthetic photo feedback',{type:'photo',id:photo})).status,201);const photoDetail=await msg(pair+'/messages/'+photoMessage+'/reference');assert.equal(photoDetail.body.photo.id,photo);assert.equal(photoDetail.body.photo.photoUrl,undefined);assert.equal((await call(`/photos/${photo}/original`,a)).status,200);assert.equal((await call(`/photos/${photo}/original`,c)).status,200);s.photoId=photo;s.routineId=routine;save();ok('authorized exact photo/routine feedback, top-level detail and cross-patient reference rejection');
 await db.query('update user_profiles set "dermatologistId"=$2 where id=$1',[a.id,d.id]);assert.equal((await msg(pair,c)).status,404);assert.equal((await send(first)).status,404);assert.equal((await msg(pair+'/messages/'+linked+'/reference')).status,404);assert.equal((await msg(`/patients/${a.id}/clinicians/${d.id}`,d)).body.messages.length,0);await db.query('update user_profiles set "dermatologistId"=$2 where id=$1',[a.id,c.id]);ok('reassignment revokes reads, retries and references without transferring history');
 const deniedClient=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${a.token}`}},auth:{persistSession:false,autoRefreshToken:false}});assert((await deniedClient.from('assigned_messages').select('id')).error,'Authenticated Data API unexpectedly allowed');
 const protections=await db.query("select relrowsecurity,has_table_privilege('anon','assigned_messages','SELECT,INSERT,UPDATE,DELETE') as anon,has_table_privilege('authenticated','assigned_messages','SELECT,INSERT,UPDATE,DELETE') as authenticated from pg_class where oid='assigned_messages'::regclass");assert(protections.rows[0].relrowsecurity&&!protections.rows[0].anon&&!protections.rows[0].authenticated);assert.equal((await call('/messages',c)).status,410);ok('RLS, direct Data API denial and authenticated legacy retirement');
 await db.query('delete from auth.sessions where user_id=$1',[b.id]);assert.equal((await msg('/current',b)).status,401);ok('revoked server session denied');
 if(keep){retained=true;save();console.log('Retained exact UI fixture manifest: '+state)}
 }finally{if(!retained)await cleanup();await db.end()}
 console.log(JSON.stringify({passed:true,checks,cleanup:!retained}));
})().catch(error=>{const location=String(error.stack||'').split('\n').find(line=>line.includes('assigned-messages-live.cjs:'));console.error('Assigned messaging live probe failed',error.code||error.name,location?.trim()||'');process.exitCode=1});
