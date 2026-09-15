// Local synthetic data only. Credentials/exact cleanup state stay ignored with mode 0600.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { enrollFixture, unenrollFixture } = require('./lib/enrollment-fixture.cjs');
const root = path.resolve(__dirname, '../..');
const manifestPath = path.join(root, '.local/mvp-volume-fixture.json');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function requireLoopback(value, protocols) {
  const u = new URL(value);
  assert(protocols.includes(u.protocol) && ['localhost','127.0.0.1','[::1]'].includes(u.hostname) && !u.search && !u.hash, 'Unmodified loopback endpoint required');
  return u;
}
function validate(s) {
  assert(uuid.test(s.run), 'Exact run required');
  const ids = new Set();
  for (const a of s.accounts) {
    assert(uuid.test(a.id) && !ids.has(a.id) && ['patient','clinician'].includes(a.role) && Number.isSafeInteger(a.index) && a.index >= 0 && a.email === `clearaf-volume-${s.run}-${a.index}@example.invalid`, 'Exact synthetic identity required'); ids.add(a.id);
  }
  const photos = new Set();
  for (const p of s.photos) {
    assert(uuid.test(p.id) && !photos.has(p.id) && s.accounts.some(a => a.id === p.owner && a.role === 'patient') && p.path === `${p.owner}/${p.id}.jpg`, 'Exact synthetic object required'); photos.add(p.id);
  }
}
async function cleanup(s, ports) {
  validate(s); const live = [];
  for (const a of s.accounts) {
    const r = await ports.user(a.id);
    if (r.error?.status === 404 && r.error.code === 'user_not_found' && r.data.user === null) continue;
    assert(!r.error && r.data.user?.id === a.id && r.data.user.email === a.email, 'Exact live identity required'); live.push(a);
  }
  await ports.removeObjects(s.photos.map(p => p.path)); await ports.removeRows(s);
  for (const a of live) await ports.removeUser(a.id);
  await ports.verify(s);
}
function save(s, destination = manifestPath) {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.writeFileSync(destination + '.tmp', JSON.stringify(s, null, 2), { mode: 0o600 });
  fs.chmodSync(destination + '.tmp', 0o600); fs.renameSync(destination + '.tmp', destination);
}
async function main() {
  const mode = process.argv[2]; assert(['create','inspect','cleanup'].includes(mode), 'Usage: create|inspect|cleanup');
  require('dotenv').config({ path: path.join(root,'backend/.env'), quiet: true });
  requireLoopback(process.env.DATABASE_URL,['postgres:','postgresql:']);
  const supabase = requireLoopback(process.env.SUPABASE_URL,['http:','https:']);
  const api = requireLoopback(process.env.MVP_API_URL || 'http://127.0.0.1:3001/api',['http:']);
  assert(!api.username && !api.password && ['/api','/api/'].includes(api.pathname), 'Exact API root required');
  const { createClient } = require('@supabase/supabase-js');
  const { Client } = require('pg');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(supabase.href, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const ports = {
    user: id => admin.auth.admin.getUserById(id),
    async removeObjects(paths) { for (let i=0;i<paths.length;i+=100) assert.ifError((await admin.storage.from('patient-photos').remove(paths.slice(i,i+100))).error); },
    async removeRows(s) {
      const ids = s.accounts.map(a=>a.id);
      await db.query('delete from skin_photos where id=any($1::uuid[]) and "userId"=any($2::uuid[])',[s.photos.map(p=>p.id),ids]);
      await unenrollFixture(db,ids);
      await db.query('delete from user_profiles where id=any($1::uuid[])',[ids]);
      await db.query('delete from dermatologists where id=any($1::uuid[])',[ids]);
    },
    async removeUser(id) { assert.ifError((await admin.auth.admin.deleteUser(id)).error); },
    async verify(s) {
      const r = await db.query('select (select count(*) from auth.users where id=any($1::uuid[])) + (select count(*) from user_profiles where id=any($1::uuid[])) + (select count(*) from dermatologists where id=any($1::uuid[])) + (select count(*) from skin_photos where id=any($2::uuid[])) + (select count(*) from storage.objects where bucket_id=$3 and name=any($4::text[])) as count',[s.accounts.map(a=>a.id),s.photos.map(p=>p.id),'patient-photos',s.photos.map(p=>p.path)]);
      assert.equal(Number(r.rows[0].count),0,'Exact cleanup must be complete');
    }
  };
  try {
    if (mode === 'create') {
      assert(!fs.existsSync(manifestPath),'Preserve existing manifest');
      const s = { run: crypto.randomUUID(), accounts: [], photos: [] }; save(s);
      for (let index=0;index<=500;index++) {
        const a = { id: crypto.randomUUID(), index, role: index===500?'clinician':'patient', email:`clearaf-volume-${s.run}-${index}@example.invalid`, password:crypto.randomBytes(24).toString('base64url') };
        // Write ahead of Auth creation: interruptions preserve exact intended identity.
        s.accounts.push(a); save(s);
        const r = await admin.auth.admin.createUser({ id:a.id,email:a.email,password:a.password,email_confirm:true,user_metadata:{name:`Synthetic Volume ${String(index).padStart(3,'0')}`} });
        assert.ifError(r.error); assert.equal(r.data.user.id,a.id,'Auth must honor pre-recorded UUID');
      }
      const owner=s.accounts[0], clinician=s.accounts[500];
      await db.query('insert into dermatologists(id,name,email,password) values($1,$2,$3,$4)',[clinician.id,'Synthetic Volume Clinician',clinician.email,'UNUSED_SUPABASE_AUTH']);
      await db.query('update user_profiles set "dermatologistId"=$1,"onboardingCompleted"=true where id=any($2::uuid[])',[clinician.id,s.accounts.slice(0,500).map(a=>a.id)]);
      const patientIds=s.accounts.slice(0,500).map(a=>a.id);
      const anonClient=createClient(supabase.href,process.env.SUPABASE_ANON_KEY,options);
      const patientLogin=await anonClient.auth.signInWithPassword({email:owner.email,password:owner.password}); assert.ifError(patientLogin.error);
      const enrollmentResp=await fetch(api.href.replace(/\/$/,'')+'/enrollment',{headers:{Authorization:`Bearer ${patientLogin.data.session.access_token}`}});
      assert.equal(enrollmentResp.status,200,'Enrollment lookup failed');
      const enrollment=await enrollmentResp.json();
      await enrollFixture(db,patientIds,{rulesVersion:enrollment.rulesVersion,documentVersion:enrollment.consent.version,documentSha256:enrollment.consent.sha256});
      const bytes=await require('sharp')({create:{width:1600,height:1200,channels:3,background:'#739586'}}).jpeg().toBuffer(); s.originalBytes=bytes.length; save(s);
      for (let i=0;i<1000;i++) {
        const id=crypto.randomUUID(), p={id,owner:owner.id,path:`${owner.id}/${id}.jpg`,captureDate:new Date(Date.UTC(2026,0,1)+i*60_000).toISOString()};
        s.photos.push(p); save(s);
        assert.ifError((await admin.storage.from('patient-photos').upload(p.path,bytes,{contentType:'image/jpeg',upsert:false})).error);
        await db.query('insert into skin_photos(id,"userId","photoUrl","captureDate",notes,"createdAt","updatedAt") values($1,$2,$3,$4,$5,now(),now())',[id,owner.id,p.path,p.captureDate,'Generated synthetic volume fixture']);
      }
      console.log(JSON.stringify({created:true,patients:500,photos:1000,manifest:'.local/mvp-volume-fixture.json'}));
    } else {
      const s=JSON.parse(fs.readFileSync(manifestPath,'utf8')); validate(s);
      if (mode==='cleanup') { await cleanup(s,ports);fs.unlinkSync(manifestPath);console.log('Exact synthetic volume fixture cleaned');return; }
      const clinician=s.accounts.find(a=>a.role==='clinician'),owner=s.accounts.find(a=>a.role==='patient');
      const client=createClient(supabase.href,process.env.SUPABASE_ANON_KEY,options);
      const login=await client.auth.signInWithPassword({email:clinician.email,password:clinician.password}); assert.ifError(login.error);
      const headers={Authorization:`Bearer ${login.data.session.access_token}`};
      const get=async route=>{const start=performance.now(); const r=await fetch(api.href.replace(/\/$/,'')+route,{headers,redirect:'error'});assert.equal(r.status,200,'API status');const bytes=Buffer.from(await r.arrayBuffer());return {ms:performance.now()-start,bytes,json:()=>JSON.parse(bytes.toString())};};
      const evidence={measuredAt:new Date().toISOString(),run:s.run,generatedOriginalBytes:s.originalBytes,requests:20,api:{},plans:{}};
      for (const [label,route,total] of [['patients','/users/patients?page=1&limit=20',500],['photos',`/photos/patient/${owner.id}?view=summary&page=1&limit=24`,1000]]) {
        const warm=await get(route);assert.equal(warm.json().pagination.total,total);const samples=[];
        for(let i=0;i<20;i++){const r=await get(route);samples.push({ms:r.ms,bytes:r.bytes.length});}
        const sorted=samples.map(r=>r.ms).sort((a,b)=>a-b);evidence.api[label]={p50Ms:sorted[9],p95Ms:sorted[18],samples,pagination:warm.json().pagination};
      }
      const page=(await get(`/photos/patient/${owner.id}?view=summary&page=1&limit=24`)).json().data;
      const thumbnails=async()=>{let next=0;const sizes=[],start=performance.now();await Promise.all([0,1].map(async()=>{while(next<page.length){const p=page[next++],r=await get(`/photos/${p.id}/thumbnail`);sizes.push(r.bytes.length);}}));return {ms:performance.now()-start,bytes:sizes,concurrency:2};};
      await thumbnails();evidence.thumbnailPage=await thumbnails();
      for(const [label,sql,id] of [
        ['patients','select id,name,"createdAt" from user_profiles where "dermatologistId"=$1 order by "createdAt" desc,id desc limit 20',clinician.id],
        ['photos','select * from skin_photos where "userId"=$1 order by "captureDate" desc,id desc limit 24',owner.id]
      ]) evidence.plans[label]=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,[id])).rows;
      save(evidence,path.join(root,'.local/mvp-volume-api-evidence.json'));
      console.log(JSON.stringify({measured:true,patients:evidence.api.patients.pagination,photos:evidence.api.photos.pagination,patientP95Ms:evidence.api.patients.p95Ms,photoP95Ms:evidence.api.photos.p95Ms,thumbnailPageMs:evidence.thumbnailPage.ms}));
    }
  } finally {await db.end();}
}
module.exports={requireLoopback,validate,cleanup};
if(require.main===module)main().catch(()=>{console.error('Volume fixture failed; exact manifest preserved. No credentials logged.');process.exitCode=1;});
