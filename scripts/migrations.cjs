// Routine migration commands target only the explicitly configured local stack.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const config=require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root,'backend/.env')));
require('../backend/scripts/recovery-drill.cjs').local(config.DATABASE_URL,['postgres:','postgresql:']);
const mode=process.argv[2];if(!['status','apply'].includes(mode))throw Error('Expected status or apply');
const env={...process.env};const socket=path.join(require('node:os').homedir(),'.colima/clearaf/docker.sock');if(!env.DOCKER_HOST&&fs.existsSync(socket))env.DOCKER_HOST=`unix://${socket}`;
const args=mode==='status'?['migration','list','--local']:['db','push','--local','--yes'];
const r=spawnSync('npx',['--yes','supabase@2.117.0',...args],{cwd:root,env,stdio:'inherit'});process.exitCode=r.status??1;
