import test from 'node:test';
import assert from 'node:assert/strict';
const recovery=require('../../scripts/recovery.cjs');
const drill=require('../scripts/recovery-drill.cjs');
test('isolated recovery configuration binds exact projects and disjoint loopback ports',()=>{
 const source=recovery.isolatedConfig('project_id = "clearaf-local"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[local_smtp]\nport = 54324\n[auth.rate_limit]\nemail_sent = 2\nsign_in_sign_ups = 30\n','clearaf-unzit-evidence');
 assert.match(source,/project_id = "clearaf-unzit-evidence"/);assert.match(source,/port = 55321/);assert.match(source,/port = 55322/);assert.match(source,/port = 55324/);assert.match(source,/email_sent = 1000/);
 assert.throws(()=>recovery.isolatedConfig('','clearaf-local'));
});
test('recovery database container allowlist is exact',()=>{
 for(const name of ['supabase_db_clearaf-local','supabase_db_clearaf-restore','supabase_db_clearaf-unzit-evidence','supabase_db_clearaf-unzit-restore'])assert.doesNotThrow(()=>drill.validateContainer(name));
 for(const name of ['supabase_db_clearaf-production','supabase_db_clearaf-unzit-evidence-evil','other'])assert.throws(()=>drill.validateContainer(name));
});
test('isolated recovery target status cannot silently retain original environment endpoints',()=>{
 const env={DATABASE_URL:'old',SUPABASE_URL:'old',MAILPIT_URL:'old'};
 recovery.applyStatus(env,{DB_URL:'postgresql://postgres:test@127.0.0.1:55322/postgres',API_URL:'http://127.0.0.1:55321',ANON_KEY:'synthetic',SERVICE_ROLE_KEY:'synthetic'},'clearaf-unzit-evidence');
 assert.match(env.DATABASE_URL,/55322/);assert.match(env.SUPABASE_URL,/55321/);assert.equal(env.MAILPIT_URL,'http://127.0.0.1:55324');
 assert.throws(()=>recovery.applyStatus({}, {DB_URL:'postgresql://postgres:test@db.evil.test/postgres',API_URL:'http://127.0.0.1:55321'},'clearaf-unzit-evidence'));
});
test('default recovery refuses unknown accounts using counts before any fixture mutation',async()=>{
 let queries=0;const db={query:async()=>{queries++;return{rows:[{count:'1'}]}}};
 await assert.rejects(()=>recovery.preflightSource(db,undefined),/outside|unknown/i);assert.equal(queries,1);
});
test('isolated entry refuses inherited Stripe configuration before hiding or using it',()=>{
 assert.throws(()=>recovery.refuseStripeConfiguration({STRIPE_SECRET_KEY:'sk_live_synthetic'}),/Stripe/);
 assert.throws(()=>recovery.refuseStripeConfiguration({STRIPE_WEBHOOK_SECRET:'synthetic'}),/Stripe/);
 assert.doesNotThrow(()=>recovery.refuseStripeConfiguration({STRIPE_SECRET_KEY:''}));
});
const legacyFixture=()=>{
 const run='11111111-1111-4111-8111-111111111111';
 return{run,accounts:['patientA','patientB','doctorA','doctorB'].map((role,i)=>({role,id:`22222222-2222-4222-8222-22222222222${i}`,email:`clearaf-security-${run}-${role.toLowerCase()}@example.invalid`,password:'synthetic-password'})),photoIds:['33333333-3333-4333-8333-333333333333'],paths:['22222222-2222-4222-8222-222222222220/33333333-3333-4333-8333-333333333333.png'],routineRevisionIds:['44444444-4444-4444-8444-444444444444'],routineCompletionIds:['55555555-5555-4555-8555-555555555555'],allowlistRows:[]};
};
const launchSeed={id:'00000000-0000-4000-8000-000000000039',version:1,active:true,careAmountCents:3900,allInAmountCents:8900,carePriceId:null,allInPriceId:null,clinicianId:null,contentVersion:'0.9-draft',content:{},weeklyWeeks:8,createdAt:'2026-11-09T00:00:00.000Z'};
test('legacy preflight refuses changed launch seed before collecting clinical rows',async()=>{
 const db={query:async(sql:string)=>sql.includes('launch_settings')?{rows:[{...launchSeed,clinicianId:'unknown'}]}:{rows:[{count:'0'}]}};
 await assert.rejects(()=>recovery.preflightSource(db,legacyFixture()),/seed/);
});
for(const [table,key]of [['skin_photos','photoIds'],['care_routine_revisions','routineRevisionIds'],['care_routine_completions','routineCompletionIds']]as const)test(`legacy preflight rejects unrecorded ${table} IDs even for known patients`,async()=>{
 const fixture=legacyFixture();let checked=false;
 const db={query:async(sql:string,values:any[])=>{
  if(sql.includes('launch_settings'))return{rows:[launchSeed]};
  if(sql.includes(`public."${table}"`)&&sql.includes('"id"=ANY')){checked=true;assert.deepEqual(values[0],fixture[key]);return{rows:[{count:'1'}]};}
  return{rows:[{count:'0'}]};
 }};
 await assert.rejects(()=>recovery.preflightSource(db,fixture),/fixture/);assert(checked);
});
test('legacy preflight refuses an unrecorded storage path under a known account',async()=>{
 const fixture=legacyFixture();const db={query:async(sql:string,values:any[])=>{
  if(sql.includes('launch_settings'))return{rows:[launchSeed]};
  if(sql.includes('storage.objects')){assert.deepEqual(values[0],fixture.paths);return{rows:[{count:'1'}]};}
  return{rows:[{count:'0'}]};
 }};
 await assert.rejects(()=>recovery.preflightSource(db,fixture),/storage/);
});
test('isolated process environment parses PostgreSQL naive timestamps in UTC',()=>{
 const target={TZ:'America/Chicago'};recovery.configureIsolatedEnvironment(target);
 assert.equal(target.TZ,'UTC');assert.equal((target as any).BILLING_PROVIDER,'fake');assert.equal((target as any).ENROLLMENT_ENFORCEMENT,'off');
});
test('CLI timezone normalization parses naive database timestamps canonically without import side effects',()=>{
 const {spawnSync}=require('node:child_process');const path=require('node:path');
 const result=spawnSync(process.execPath,['-e',`const assert=require('node:assert/strict');const recovery=require(process.argv[1]);assert.equal(process.env.TZ,'America/Chicago');assert.equal(new Date('2026-11-09T00:00:00').toISOString(),'2026-11-09T06:00:00.000Z');recovery.configureCliTimezone();assert.equal(new Date('2026-11-09T00:00:00').toISOString(),'2026-11-09T00:00:00.000Z');`,path.resolve(__dirname,'../../scripts/recovery.cjs')],{env:{...process.env,TZ:'America/Chicago'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
for(const [project,apiPort,dbPort,mailPort]of [
 ['clearaf-unzit-signup-evidence',57321,57322,57324],['clearaf-unzit-signup-restore',58321,58322,58324],
 ['clearaf-unzit-signup-fake-evidence',59321,59322,59324],['clearaf-unzit-signup-fake-restore',60321,60322,60324]
]as const)test(`atomic signup isolation binds exact ${project} targets`,()=>{
 const config=recovery.isolatedConfig('project_id = "clearaf-local"\nport = 54321\nport = 54322\nport = 54324',project);assert(config.includes(`project_id = "${project}"`));assert(config.includes(`port = ${apiPort}`));
 const env:any={TZ:'America/Chicago'};recovery.applyStatus(env,{DB_URL:`postgresql://postgres:test@127.0.0.1:${dbPort}/postgres`,API_URL:`http://127.0.0.1:${apiPort}`,ANON_KEY:'synthetic',SERVICE_ROLE_KEY:'synthetic'},project);assert.equal(env.MAILPIT_URL,`http://127.0.0.1:${mailPort}`);assert.equal(env.PG_DOCKER_CONTAINER,'supabase_db_'+project);assert.doesNotThrow(()=>drill.validateContainer(env.PG_DOCKER_CONTAINER));
 assert.throws(()=>recovery.applyStatus(env,{DB_URL:`postgresql://postgres:test@127.0.0.1:55322/postgres`,API_URL:'http://127.0.0.1:55321',ANON_KEY:'synthetic',SERVICE_ROLE_KEY:'synthetic'},project),/port/);
 assert.throws(()=>recovery.isolatedConfig('',project+'-evil'));assert.throws(()=>drill.validateContainer('supabase_db_'+project+'-evil'));
});
test('atomic signup recovery and later fake-only checks use distinct fixed projects',()=>{
 assert.deepEqual(recovery.isolatedProjects(['--isolated-unzit','--atomic-signup']),['clearaf-unzit-signup-evidence','clearaf-unzit-signup-restore']);
 assert.deepEqual(recovery.isolatedProjects(['--isolated-unzit','--atomic-signup','--fake-only']),['clearaf-unzit-signup-fake-evidence','clearaf-unzit-signup-fake-restore']);
 assert.deepEqual(recovery.isolatedProjects(['--isolated-unzit']),['clearaf-unzit-evidence','clearaf-unzit-restore']);
});
test('atomic CLI initializes its exact project map before invocation',()=>{
 const {spawnSync}=require('node:child_process');const path=require('node:path');
 // Invalid arguments stop before Docker, filesystem ownership, or fixture work.
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/recovery.cjs'),'--isolated-unzit','--atomic-signup','--invalid'],{env:{PATH:process.env.PATH,TZ:'America/Chicago'},encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Unexpected isolated recovery argument/);assert.doesNotMatch(result.stderr,/before initialization/);
});
test('CLI reaches isolated config creation before the first mocked stack start',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const writes:string[]=[],errors:string[]=[];const main={exports:{}};
 const mockedRequire=(id:string)=>id==='node:fs'?{existsSync:()=>false,mkdirSync:()=>{},readFileSync:()=>`project_id = "clearaf-local"\nport = 54321`,writeFileSync:(file:string)=>writes.push(file),cpSync:()=>{}}:id==='node:child_process'?{spawnSync:(command:string,args:string[])=>({status:command==='docker'||args.includes('stop')?0:1,stdout:''})}:id.includes('dotenv')?{}:id.includes('recovery-drill')?{local:()=>{}}:require(id);
 mockedRequire.main=main;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../scripts/recovery.cjs'),'utf8'),{require:mockedRequire,module:main,__dirname:path.resolve(__dirname,'../../scripts'),process:{env:{},argv:['node','recovery.cjs','--isolated-unzit','--atomic-signup'],execPath:process.execPath},console:{log:()=>{},error:(message:string)=>errors.push(message)},setTimeout,clearTimeout});
 await new Promise(resolve=>setImmediate(resolve));assert(writes.some(file=>file.endsWith('supabase/config.toml')));assert.deepEqual(errors,['npx --yes failed']);
});
