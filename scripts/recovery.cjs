// End-to-end local recovery rehearsal. Requires a fresh or this task's synthetic stack.
function configureCliTimezone(){process.env.TZ='UTC';}
if(require.main===module)configureCliTimezone();
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend'),local=path.join(root,'.local');
const dotenv=require('../backend/node_modules/dotenv');
const env={...process.env};
if(require.main===module&&!process.argv.includes('--isolated-unzit'))dotenv.config({path:path.join(backend,'.env'),quiet:true});
if(require.main===module)Object.assign(env,process.env);
const {local:validateLocal}=require('../backend/scripts/recovery-drill.cjs');
if(require.main===module&&!process.argv.includes('--isolated-unzit')){validateLocal(env.DATABASE_URL,['postgres:','postgresql:']);validateLocal(env.SUPABASE_URL,['http:','https:']);}
delete env.SECURITY_ALLOW_PRODUCTION;
const socket=path.join(require('node:os').homedir(),'.colima/clearaf/docker.sock');if(!env.DOCKER_HOST&&fs.existsSync(socket))env.DOCKER_HOST=`unix://${socket}`;
const state=path.join(local,'security-fixtures.json');env.SECURITY_FIXTURE_STATE=state;env.SECURITY_API_URL='http://127.0.0.1:3002/api';env.PORT='3002';
const excludes='realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
const stamp=Date.now();env.RECOVERY_DIR=path.join(local,`recovery-${stamp}`);
env.RECOVERY_SCHEMA_PATH=path.join(local,`recovery-schema-${stamp}.json`);
fs.mkdirSync(local,{recursive:true,mode:0o700});
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024,...options});if(r.status!==0)throw Error(`${command} ${args[0]} failed`);return r.stdout}
function cli(args){return run('npx',['--yes','supabase@2.117.0',...args]);}
function operation(mode){console.log(run(process.execPath,['scripts/recovery-drill.cjs',mode],{cwd:backend}).trim());}
let api,sourceStopped=false,restoreStarted=false;
const restore=path.join(local,'restore-stack');
async function stopApi(){if(!api)return;const child=api;api=undefined;if(child.exitCode!==null||child.signalCode!==null)return;let timer;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000)});clearTimeout(timer)}
async function startApi(){const fd=fs.openSync(path.join(local,'recovery-api.log'),'w',0o600);api=spawn(process.execPath,['dist/server.js'],{cwd:backend,env,stdio:['ignore',fd,fd]});fs.closeSync(fd);for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if(api.exitCode!==null)throw Error('Local API exited');try{if((await fetch('http://127.0.0.1:3002/ready',{signal:AbortSignal.timeout(2500)})).status===200)return}catch{}}throw Error('Local API did not become ready')}
async function main(){
 const db=new(require('../backend/node_modules/pg').Client)({connectionString:env.DATABASE_URL});await db.connect();try{await preflightSource(db,fs.existsSync(state)?JSON.parse(fs.readFileSync(state)):undefined)}finally{await db.end()}
 operation('schema-source');
 // security-live.cjs prepare enrolls its synthetic patients through the live API
 // (enrollment-fixture.cjs), so the API must already be up before it runs.
 await startApi();
 if(!fs.existsSync(state))console.log(run(process.execPath,['scripts/security-live.cjs','prepare'],{cwd:backend}).trim());
 console.log(run(process.execPath,['scripts/accounts-live.cjs'],{cwd:backend}).trim());run(process.execPath,['scripts/security-live.cjs','verify'],{cwd:backend});await stopApi();
 run(process.execPath,['scripts/migration-drill.cjs'],{cwd:backend});
 env.RECOVERY_QUIESCENT='1';env.PG_DOCKER_CONTAINER='supabase_db_clearaf-local';operation('backup');
 cli(['stop','--project-id','clearaf-local']);sourceStopped=true;
 fs.mkdirSync(path.join(restore,'supabase'),{recursive:true});
 fs.writeFileSync(path.join(restore,'supabase/config.toml'),fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8').replace('project_id = "clearaf-local"','project_id = "clearaf-restore"'));
 fs.cpSync(path.join(root,'supabase/migrations'),path.join(restore,'supabase/migrations'),{recursive:true});
 restoreStarted=true;cli(['start','--workdir',restore,'-x',excludes]);
 const status=JSON.parse(cli(['status','--workdir',restore,'-o','json']));
 Object.assign(env,{DATABASE_URL:status.DB_URL,DIRECT_URL:status.DB_URL,SUPABASE_URL:status.API_URL,SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,PG_DOCKER_CONTAINER:'supabase_db_clearaf-restore'});
 operation('schema-destination');operation('restore-verify');await startApi();run(process.execPath,['scripts/security-live.cjs','verify'],{cwd:backend});await stopApi();
 const report={passed:true,verifiedAt:new Date().toISOString(),elapsedSeconds:Math.round((Date.now()-stamp)/1000),freshDestination:true,liveChecksAfterRestore:JSON.parse(fs.readFileSync(path.join(local,'live-verification.json'))).passed.length,scope:'Synthetic local database, auth identities and storage bytes; no production patient data'};
 fs.writeFileSync(path.join(local,'recovery-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 cli(['stop','--workdir',restore,'--no-backup']);restoreStarted=false;
 cli(['start','-x',excludes]);sourceStopped=false;
 const original=JSON.parse(cli(['status','-o','json']));Object.assign(env,{DATABASE_URL:original.DB_URL,DIRECT_URL:original.DB_URL,SUPABASE_URL:original.API_URL,SUPABASE_ANON_KEY:original.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:original.SERVICE_ROLE_KEY});
 run(process.execPath,['scripts/security-live.cjs','cleanup'],{cwd:backend});
}


const isolatedProjectPorts=Object.freeze({'clearaf-unzit-evidence':55300,'clearaf-unzit-restore':56300,'clearaf-unzit-signup-evidence':57300,'clearaf-unzit-signup-restore':58300,'clearaf-unzit-signup-fake-evidence':59300,'clearaf-unzit-signup-fake-restore':60300});
function isolatedProjects(args){return args.includes('--atomic-signup')?(args.includes('--fake-only')?['clearaf-unzit-signup-fake-evidence','clearaf-unzit-signup-fake-restore']:['clearaf-unzit-signup-evidence','clearaf-unzit-signup-restore']):['clearaf-unzit-evidence','clearaf-unzit-restore'];}
function isolatedConfig(config,project){
 if(!Object.hasOwn(isolatedProjectPorts,project))throw Error('Refusing unexpected isolated project');
 const delta=isolatedProjectPorts[project]-54300;
 return config.replace(/project_id = "clearaf-local"/,`project_id = "${project}"`).replace(/\b543(\d{2})\b/g,(_,suffix)=>String(54300+Number(suffix)+delta)).replace(/email_sent = 2\b/,'email_sent = 1000').replace(/sign_in_sign_ups = 30\b/,'sign_in_sign_ups = 1000').replace(/token_verifications = 30\b/,'token_verifications = 1000');
}
function applyStatus(target,status,project){
 validateLocal(status.DB_URL,['postgres:','postgresql:']);validateLocal(status.API_URL,['http:','https:']);
 const base=isolatedProjectPorts[project],apiPort=String(base+21),dbPort=String(base+22);
 if(!Object.hasOwn(isolatedProjectPorts,project)||new URL(status.API_URL).port!==apiPort||new URL(status.DB_URL).port!==dbPort)throw Error('Isolated target port mismatch');
 if(!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw Error('Missing local runtime keys');
 Object.assign(target,{DATABASE_URL:status.DB_URL,DIRECT_URL:status.DB_URL,SUPABASE_URL:status.API_URL,SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,PG_DOCKER_CONTAINER:'supabase_db_'+project,MAILPIT_URL:'http://127.0.0.1:'+String(base+24)});
}
function refuseStripeConfiguration(target){if(Object.entries(target).some(([name,value])=>name.startsWith('STRIPE_')&&value))throw Error('Stripe configuration forbidden in isolated fake evidence');}
function configureIsolatedEnvironment(target){refuseStripeConfiguration(target);Object.assign(target,{TZ:'UTC',NODE_ENV:'development',ENROLLMENT_ENFORCEMENT:'off',BILLING_PROVIDER:'fake',BILLING_RETURN_ORIGIN:'http://127.0.0.1:3002'});}
async function isolatedMain(){
 configureIsolatedEnvironment(env);
 if(process.argv.some(a=>!['--isolated-unzit','--fake-only','--atomic-signup'].includes(a)&&process.argv.indexOf(a)>1))throw Error('Unexpected isolated recovery argument');
 const projects=isolatedProjects(process.argv.slice(2));
 const workdirs=projects.map(p=>path.join(local,p));
 // Require new directories: no unrelated container or volume may be claimed as this run's.
 for(const dir of workdirs)if(fs.existsSync(dir))throw Error('Isolated project already exists; retained fixtures require review');
 const existing=run('docker',['ps','-a','--format','{{.Names}}']).split(/\s+/);
 const volumes=run('docker',['volume','ls','--format','{{.Name}}']).split(/\s+/);
 for(const project of projects){
  if(run('docker',['volume','ls','--filter','label=com.supabase.cli.project='+project,'--format','{{.Name}}']).trim())throw Error('Isolated labeled volumes already exist');
 }
 for(const project of projects)if(volumes.some(name=>name.endsWith('_'+project)))throw Error('Isolated project volumes already exist');
 for(const project of projects)if(existing.some(name=>name.endsWith('_'+project)))throw Error('Isolated project containers already exist');
 for(const [index,dir]of workdirs.entries()){
  fs.mkdirSync(path.join(dir,'supabase'),{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dir,'supabase/config.toml'),isolatedConfig(fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8'),projects[index]),{mode:0o600});
  fs.cpSync(path.join(root,'supabase/migrations'),path.join(dir,'supabase/migrations'),{recursive:true});
 }
 env.SECURITY_FIXTURE_STATE=path.join(workdirs[0],'fixtures.json');
 const owned=[];
 try{
  owned.push(0);cli(['start','--workdir',workdirs[0],'-x',excludes]);applyStatus(env,JSON.parse(cli(['status','--workdir',workdirs[0],'-o','json'])),projects[0]);
  operation('schema-source');await startApi();
  run(process.execPath,['scripts/security-live.cjs','prepare'],{cwd:backend});
  run(process.execPath,['scripts/accounts-live.cjs'],{cwd:backend});
  run(process.execPath,['scripts/security-live.cjs','verify'],{cwd:backend});
  run(process.execPath,['scripts/unzit-launch-live.cjs','--provider','fake','--prepare-recovery','--fixture-state',env.SECURITY_FIXTURE_STATE],{cwd:backend});
  if(process.argv.includes('--fake-only')){await stopApi();console.log(JSON.stringify({passed:true,provider:'fake',isolated:true,projects,apiPorts:projects.map(p=>isolatedProjectPorts[p]+21),accounts:6,stripeTest:'pending: no keys supplied; no Stripe API calls'}));return;}
  await stopApi();run(process.execPath,['scripts/migration-drill.cjs'],{cwd:backend});
  env.RECOVERY_QUIESCENT='1';operation('backup');
  // Distinct ports allow source volumes to remain intact throughout destination verification.
  owned.push(1);cli(['start','--workdir',workdirs[1],'-x',excludes]);applyStatus(env,JSON.parse(cli(['status','--workdir',workdirs[1],'-o','json'])),projects[1]);
  operation('schema-destination');operation('restore-verify');await startApi();
  run(process.execPath,['scripts/unzit-launch-live.cjs','--provider','fake','--verify-restored','--fixture-state',env.SECURITY_FIXTURE_STATE],{cwd:backend});await stopApi();
  const report={passed:true,verifiedAt:new Date().toISOString(),freshDestination:true,isolated:true,projects,apiPorts:projects.map(p=>isolatedProjectPorts[p]+21),accounts:6,scope:'Exact synthetic local fixtures, full application digests, ledger and private storage bytes',stripeTest:'pending: no keys supplied; no Stripe API calls'};
  fs.writeFileSync(path.join(local,'unzit-recovery-verification.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
  // Retain owned volumes until the orchestrator has reviewed the evidence and explicitly cleans them.
  console.log('PASS isolated recovery; exact owned projects retained for review');
 }finally{await stopApi();for(const index of owned)try{cli(['stop','--workdir',workdirs[index]])}catch{console.error('Owned isolated volumes retained; local recovery needs attention')}}
}
async function preflightSource(db,fixture){
 const assert=require('node:assert/strict');const drill=require('../backend/scripts/recovery-drill.cjs');
 const accounts=fixture?require('../backend/scripts/lib/unzit-live-guards.cjs').validateFixture(fixture):[];const ids=accounts.map(a=>a.id);
 assert.equal(Number((await db.query('SELECT count(*) FROM auth.users WHERE NOT(id=ANY($1::uuid[]))',[ids])).rows[0].count),0,'Database contains accounts outside known fixtures');
 if(fixture?.launch){await require('../backend/scripts/unzit-launch-live.cjs').validateCapturedLaunch(db,fixture);return;}
 drill.validateLaunchSeed((await db.query('SELECT * FROM public.launch_settings ORDER BY version')).rows);
 const patients=accounts.filter(a=>a.role.startsWith('patient')).map(a=>a.id),doctors=accounts.filter(a=>a.role.startsWith('doctor')).map(a=>a.id);
 const rules={
  user_profiles:{condition:'"id"=ANY($1::uuid[]) AND name LIKE $2',values:[ids,'Synthetic%']},
  dermatologists:{condition:'"id"=ANY($1::uuid[]) AND name=$2',values:[doctors,'Synthetic Security Clinician']},
  skin_photos:{condition:'"id"=ANY($1::uuid[]) AND "userId"=ANY($2::uuid[]) AND "photoUrl"=ANY($3::text[]) AND notes LIKE $4 AND "launchTargetId" IS NULL',values:[fixture?.photoIds||[],patients,fixture?.paths||[],'Synthetic%']},
  care_routine_revisions:{condition:'"id"=ANY($1::uuid[]) AND "userId"=ANY($2::uuid[]) AND "createdBy"=ANY($3::uuid[]) AND name=$4',values:[fixture?.routineRevisionIds||[],patients,doctors,'Synthetic recovery routine']},
  care_routine_completions:{condition:'"id"=ANY($1::uuid[]) AND "userId"=ANY($2::uuid[]) AND "revisionId"=ANY($3::uuid[])',values:[fixture?.routineCompletionIds||[],patients,fixture?.routineRevisionIds||[]]},
  eligibility_screenings:{condition:'"userId"=ANY($1::uuid[]) AND "stateCode"=$2 AND "dateOfBirth"=$3::date AND "pregnancyStatus"=$4 AND eligible=true',values:[patients,'IL','1990-01-01','none']},
  consent_acceptances:{condition:'"userId"=ANY($1::uuid[]) AND "documentKey"=$2 AND "versionLabel"=$2 AND "observedIp" IS NULL',values:[patients,'legacy']},
  launch_allowlist:{condition:'"id"=ANY($1::uuid[]) AND "importBatch"=$2::uuid AND email=ANY($3::text[]) AND enabled=true',values:[(fixture?.allowlistRows||[]).map(r=>r.id),fixture?.run||'00000000-0000-4000-8000-000000000000',(fixture?.allowlistRows||[]).map(r=>r.email)]}
 };
 for(const table of drill.applicationTables.filter(t=>t!=='launch_settings')){
  const rule=rules[table];const sql=rule?`SELECT count(*) FROM public."${table}" WHERE (${rule.condition}) IS NOT TRUE`:`SELECT count(*) FROM public."${table}"`;
  assert.equal(Number((await db.query(sql,rule?rule.values:[])).rows[0].count),0,'Unknown application fixture data');
 }
 for(const table of ['eligibility_screenings','consent_acceptances'])assert.equal(Number((await db.query(`SELECT count(*) FROM (SELECT "userId" FROM public."${table}" GROUP BY "userId" HAVING count(*)<>1) inconsistent`)).rows[0].count),0,'Unknown duplicate enrollment fixture data');
 const paths=fixture?.paths||[];
 assert(paths.every(p=>typeof p==='string'&&!p.includes('..')&&!p.includes('\\')&&patients.some(id=>p.startsWith(id+'/'))),'Invalid fixture storage paths');
 assert.equal(Number((await db.query("SELECT count(*) FROM storage.objects WHERE (bucket_id='patient-photos' AND name=ANY($1::text[])) IS NOT TRUE",[paths])).rows[0].count),0,'Unknown storage fixture path');

}
module.exports={isolatedProjects,isolatedConfig,applyStatus,preflightSource,refuseStripeConfiguration,configureIsolatedEnvironment,configureCliTimezone};

if(require.main===module)(process.argv.includes('--isolated-unzit')?isolatedMain():main()).catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{
 await stopApi();
 for(const args of [...(restoreStarted?[['stop','--workdir',restore]]:[]),...(sourceStopped?[['start','-x',excludes]]:[])])try{cli(args)}catch{console.error('Local stack recovery needs attention; saved volumes were retained.');process.exitCode=1}
});
