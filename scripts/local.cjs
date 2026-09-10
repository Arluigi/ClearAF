// Local setup captures CLI credentials directly into ignored files, never stdout.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = { ...process.env };
const colima = path.join(require('node:os').homedir(), '.colima/clearaf/docker.sock');
if (!env.DOCKER_HOST && fs.existsSync(colima)) env.DOCKER_HOST = `unix://${colima}`;
const cli = args => {
  const r = spawnSync('npx', ['--yes', 'supabase@2.117.0', ...args], { cwd: root, env, encoding: 'utf8', maxBuffer: 16*1024*1024 });
  if (r.status !== 0) throw Error(`Local Supabase ${args[0]} failed. Check the container runtime and available disk space.`);
  return r.stdout;
};
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, {mode:0o600}); fs.chmodSync(file,0o600); }
function loopback(value) { const u=new URL(value); return ['http:','https:','postgres:','postgresql:'].includes(u.protocol)&&!u.search&&!u.hash&&['127.0.0.1','localhost','[::1]'].includes(u.hostname); }
try {
  const mode = process.argv[2] || 'configure';
  if (mode === 'start') cli(['start', '-x', 'realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
  else if (mode === 'stop') { cli(['stop']); console.log('Local Supabase stopped; local data retained.'); process.exit(0); }
  else if (mode !== 'configure') throw Error('Expected start, configure or stop');
  const status = JSON.parse(cli(['status','-o','json']));
  if (!loopback(status.API_URL) || !loopback(status.DB_URL) || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw Error('Expected a local Supabase stack; refusing nonlocal configuration.');
  const pairs = { DATABASE_URL:status.DB_URL, DIRECT_URL:status.DB_URL, SUPABASE_URL:status.API_URL, SUPABASE_ANON_KEY:status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY, PORT:'3001', NODE_ENV:'development', FRONTEND_URL:'http://localhost:3000', SECURITY_API_URL:'http://127.0.0.1:3001/api', SECURITY_FIXTURE_STATE:path.join(root,'.local/security-fixtures.json') };
  const backendFile=path.join(root,'backend/.env');
  if(fs.existsSync(backendFile)) {
    const current=require('../backend/node_modules/dotenv').parse(fs.readFileSync(backendFile));
    if(current.SUPABASE_URL && !loopback(current.SUPABASE_URL)) throw Error('Existing backend configuration is nonlocal; refusing to overwrite it.');
  }
  write(backendFile,Object.entries(pairs).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n');
  write(path.join(root,'web-portal/.env.local'),Object.entries({NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,NEXT_PUBLIC_API_URL:pairs.SECURITY_API_URL}).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n');
  write(path.join(root,'ClearAF/Config/Local.generated.xcconfig'),`// Generated local public anon key; never add service credentials.\nCLEARAF_LOCAL_SUPABASE_ANON_KEY = ${status.ANON_KEY}\n`);
  console.log('Local backend, portal and iOS configuration generated. No production credentials used.');
} catch(e) { console.error(e.message); process.exitCode=1; }
