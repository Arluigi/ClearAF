import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {createLaunchReview} from '../src/services/launchReview';
import {contracts} from '../src/contracts/unzitLaunch';
const localTest:typeof test=process.env.CI&&process.env.UNZIT_SCHEMA_TESTS!=='1'
 ? ((name:any,fn:any)=>test(name,{skip:'Requires local Supabase'},fn)) as typeof test : test;
localTest('queue reads current assignment without locks and paginates all kinds in SQL, including empty pages',async()=>{
 const c=new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres',connectionTimeoutMillis:3000});await c.connect();
 try{
  // Temporary tables isolate synthetic rows from the application and require no migrations.
  await c.query(`CREATE TEMP TABLE user_profiles (id uuid, name text, "dermatologistId" uuid);
   CREATE TEMP TABLE dermatologists (id uuid);
   CREATE TEMP TABLE launch_cases (id uuid, "patientId" uuid, status text, "submittedAt" timestamp, "identityId" uuid, flags jsonb);
   CREATE TEMP TABLE identity_verifications (id uuid, status text);
   CREATE TEMP TABLE launch_check_ins (id uuid, "patientId" uuid, status text, "submittedAt" timestamp, answers jsonb)`);
  const doctor='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',patient='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001',check='40000000-0000-4000-8000-000000000001';
  await c.query('INSERT INTO dermatologists VALUES ($1),($2)',[doctor,other]);
  await c.query('INSERT INTO user_profiles VALUES ($1,$2,$3)',[patient,'Synthetic',doctor]);
  await c.query(`INSERT INTO launch_cases VALUES ($1,$2,'submitted','2027-01-01',$1,'["case_flag"]')`,[id,patient]);
  await c.query(`INSERT INTO identity_verifications VALUES ($1,'uploaded')`,[id]);
  await c.query(`INSERT INTO launch_check_ins VALUES ($1,$2,'submitted','2026-12-31',$3)`,[check,patient,{physicallyInNC:false,sideEffects:{none:false},pregnancyStatus:'not_sure',newMedicines:{none:false}}]);
  let calls=0;
  const service=createLaunchReview({db:{$queryRaw:async(strings:TemplateStringsArray,...values:any[])=>{
   calls++;const sql=strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,'');
   assert.doesNotMatch(sql,/FOR\s+(UPDATE|SHARE)|pg_advisory/i);
   assert.match(sql,/ORDER BY/i);assert.match(sql,/LIMIT/i);assert.match(sql,/OFFSET/i);
   return (await c.query(sql.replaceAll('public.','pg_temp.'),values)).rows;
  },$transaction:()=>assert.fail('queue must not open an interactive transaction')}});
  const first=await service.queue(doctor,{limit:1});assert.equal(first.pagination.total,3);assert.equal(first.pagination.totalPages,3);assert.equal(first.data[0].id,check);assert.equal(first.data[0].receivedAt,'2026-12-31T00:00:00.000Z');assert.deepEqual(first.data[0].flags,['outside_nc','side_effects','pregnancy_safe_review','new_medicines']);contracts['GET /review-queue'].response.parse(first);assert.ok(calls<=2);
  assert.equal((await service.queue(doctor,{page:2,limit:1})).data[0].kind,'enrollment');
  assert.equal((await service.queue(doctor,{page:3,limit:1})).data[0].kind,'identity');
  const empty=await service.queue(doctor,{page:4,limit:1});assert.deepEqual(empty.data,[]);assert.equal(empty.pagination.total,3);
  for(const kind of ['identity','enrollment','check_in']){const r=await service.queue(doctor,{kind});assert.equal(r.pagination.total,1);assert.equal(r.data[0].kind,kind)}
  await c.query('UPDATE launch_check_ins SET "submittedAt"=NULL');
  const undated=await service.queue(doctor,{limit:1});assert.equal(undated.data[0].id,check);assert.equal(undated.data[0].receivedAt,'1970-01-01T00:00:00.000Z');
  await c.query('UPDATE user_profiles SET "dermatologistId"=$1',[other]);
  assert.deepEqual(await service.queue(doctor),{data:[],pagination:{page:1,limit:20,total:0,totalPages:0}});
  assert.equal((await service.queue(other)).pagination.total,3);
  await c.query('DELETE FROM dermatologists');assert.equal((await service.queue(other)).pagination.total,0);
 }finally{await c.end()}
});
