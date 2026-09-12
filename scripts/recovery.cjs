// End-to-end local recovery rehearsal. Requires a fresh or this task's synthetic stack.
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend'),local=path.join(root,'.local');
const dotenv=require('../backend/node_modules/dotenv');
const env={...process.env,...dotenv.parse(fs.readFileSync(path.join(backend,'.env')))};
const {local:validateLocal}=require('../backend/scripts/recovery-drill.cjs');
validateLocal(env.DATABASE_URL,['postgres:','postgresql:']);validateLocal(env.SUPABASE_URL,['http:','https:']);
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
 operation('schema-source');
 if(!fs.existsSync(state))console.log(run(process.execPath,['scripts/security-live.cjs','prepare'],{cwd:backend}).trim());
 await startApi();console.log(run(process.execPath,['scripts/accounts-live.cjs'],{cwd:backend}).trim());run(process.execPath,['scripts/security-live.cjs','verify'],{cwd:backend});await stopApi();
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
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{
 await stopApi();
 for(const args of [...(restoreStarted?[['stop','--workdir',restore]]:[]),...(sourceStopped?[['start','-x',excludes]]:[])])try{cli(args)}catch{console.error('Local stack recovery needs attention; saved volumes were retained.');process.exitCode=1}
});
