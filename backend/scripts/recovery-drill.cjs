// Synthetic local drill only. Stop all application writers before backup.
// Excludes managed configuration/secrets, auth sessions, and external integrations.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const tables = ['care_template_revisions','care_form_revisions','care_form_responses','appointments','care_routine_revisions','care_routine_completions','dermatologists','messages','photo_reviews','photo_cleanup','prescriptions','products','routine_steps','routines','skin_photos','subscriptions','user_profiles'];
let phase = 'local target and backup validation';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function local(value, protocol) {
  const u = new URL(value);
  assert(protocol.includes(u.protocol) && ['localhost','127.0.0.1','[::1]'].includes(u.hostname), 'Refusing nonloopback target');
  assert(!u.search && !u.hash, 'Target URL query overrides are forbidden');
  return u;
}
function validate(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  assert(m.version === 1 && m.files && Array.isArray(m.objects), 'Invalid recovery manifest');
  for (const required of ['data.dump','fixtures.json','snapshot.json']) assert(m.files[required], 'Missing required backup file');
  for (const [name,digest] of Object.entries(m.files)) {
    assert(/^[a-zA-Z0-9.-]+$/.test(name), 'Unsafe backup path');
    const file = path.join(dir,name);
    assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'Backup must be a regular file');
    assert.equal(hash(fs.readFileSync(file)),digest,'Backup checksum mismatch');
  }
  for (const obj of m.objects) assert(m.files[obj.file] && typeof obj.path === 'string' && !obj.path.includes('..') && obj.contentType, 'Invalid object manifest');
  assert(m.objects.length > 0, 'Backup must include storage bytes');
  return m;
}
function write(dir,name,value) { fs.writeFileSync(path.join(dir,name),value,{mode:0o600}); fs.chmodSync(path.join(dir,name),0o600); }
// The immutable baseline approval remains pinned; additive migrations are checked
// against the full applied chain and independently rebuilt destination below.
function validateMigrationChain(files, ledger, approved) {
  assert(files.length > 0 && files.length === ledger.length, 'Applied migration chain differs from repository');
  const baseline=files[0], first=ledger[0];
  assert(baseline.version===approved.version && baseline.name===approved.name && hash(Buffer.from(baseline.sql))===approved.fileSha256, 'Approved baseline file changed');
  assert(first.version===approved.version && first.name===approved.name && hash(Buffer.from(JSON.stringify(first.statements)))===approved.statementsSha256, 'Approved baseline ledger changed');
  files.forEach((file,index)=>assert(file.version===ledger[index].version && file.name===ledger[index].name && Array.isArray(ledger[index].statements) && ledger[index].statements.length>0, 'Applied migration chain differs from repository'));
}
async function schemaChain(mode) {
  const root=path.resolve(__dirname,'../..');
  const dir=path.join(root,'supabase/migrations');
  const files=fs.readdirSync(dir).filter(name=>/^\d{14}_.+\.sql$/.test(name)).sort().map(name=>({version:name.slice(0,14),name:name.slice(15,-4),sql:fs.readFileSync(path.join(dir,name),'utf8')}));
  const approved=JSON.parse(fs.readFileSync(path.join(root,'supabase/baseline.json')));
  const target=path.resolve(process.env.RECOVERY_SCHEMA_PATH||path.join(root,'.local/recovery-schema.json'));
  const {Client}=require('pg');const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
  try {
    const ledger=(await db.query('select version,name,statements from supabase_migrations.schema_migrations order by version')).rows;
    validateMigrationChain(files,ledger,approved);
    const schema=await require('./schema-baseline.cjs').snapshot(db);
    const current={files:files.map(file=>({version:file.version,name:file.name,sha256:hash(Buffer.from(file.sql))})),ledger,schema};
    if(mode==='schema-source') { fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});write(path.dirname(target),path.basename(target),JSON.stringify(current)); }
    else { assert.deepEqual(current,JSON.parse(fs.readFileSync(target)), 'Fresh migration schema/security or full ledger differs from source'); }
    console.log('PASS approved baseline integrity, repository migration chain'+(mode==='schema-destination'?' and fresh source/destination schema/security/full-ledger parity':''));
  } finally {await db.end();}
}
async function run(mode) {
  require('dotenv').config({quiet:true});
  assert(['backup','restore-verify','schema-source','schema-destination'].includes(mode),'Expected recovery or schema verification mode');
  const u = local(process.env.DATABASE_URL,['postgres:','postgresql:']);
  local(process.env.SUPABASE_URL,['http:','https:']);
  assert.equal(u.username,'postgres','Local recovery requires postgres');
  if (mode.startsWith('schema-')) return schemaChain(mode);
  if(process.env.PG_DOCKER_CONTAINER) assert(/^supabase_db_clearaf-(local|restore)$/.test(process.env.PG_DOCKER_CONTAINER),'Refusing unexpected database container');
  const dir = path.resolve(process.env.RECOVERY_DIR || '../.local/recovery');
  const statePath = path.resolve(process.env.SECURITY_FIXTURE_STATE || '../.local/security-fixtures.json');
  // Validate every byte before opening a restore connection or making any mutation.
  const manifest = mode === 'restore-verify' ? validate(dir) : undefined;
  const fixture = JSON.parse(fs.readFileSync(mode === 'backup' ? statePath : path.join(dir,'fixtures.json')));
  assert(fixture.run && fixture.accounts.length === 4 && fixture.accounts.every(a => a.email.startsWith(`clearaf-security-${fixture.run}-`) && a.email.endsWith('@example.invalid') && a.password), 'Only prepared synthetic fixtures are permitted');
  const { Client } = require('pg');
  const { createClient } = require('@supabase/supabase-js');
  const db = new Client({connectionString:process.env.DATABASE_URL});
  const admin = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const publicClient = () => createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const pgEnv = {...process.env, PGHOST:u.hostname.replace(/[\[\]]/g,''), PGPORT:u.port||'5432', PGDATABASE:decodeURIComponent(u.pathname.slice(1)), PGUSER:u.username, PGPASSWORD:decodeURIComponent(u.password)};
  for (const key of ['PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR','PGPASSFILE']) delete pgEnv[key];
  const pg = (tool,args) => {
    const container = process.env.PG_DOCKER_CONTAINER;
    const options = {env:pgEnv,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']};
    if (container) assert(/^supabase_db_clearaf-(local|restore)$/.test(container),'Refusing unexpected database container');
    const execute = (name,parameters,input) => container
      ? execFileSync('docker',['exec','-i',container,name,...parameters],{...options,input})
      : execFileSync(process.env.PG_BIN ? path.join(process.env.PG_BIN,name) : name,parameters,{...options,input});
    if (tool === 'pg_dump') {
      if (!container) return execute(tool,args);
      const dockerArgs = [...args];
      const index = dockerArgs.indexOf('--file');
      assert(index >= 0 && dockerArgs[index+1], 'Missing archive output');
      const output = dockerArgs[index+1]; dockerArgs.splice(index,2);
      const bytes = execute(tool,['--username','postgres','--dbname',pgEnv.PGDATABASE,...dockerArgs]);
      fs.writeFileSync(output,bytes,{mode:0o600});
      return bytes;
    }
    assert.equal(tool,'pg_restore','Unsupported database utility');
    const archive = args.at(-1);
    assert.equal(archive,path.join(dir,'data.dump'),'Unexpected restore archive');
    // Render only into memory. SET must execute after login rather than as a
    // startup parameter, because local Supabase establishes privileges at login.
    const sql = execute('pg_restore',['--file=-','--data-only','--no-owner','--no-privileges'],fs.readFileSync(archive));
    return execute('psql',['-X','--username','postgres','--single-transaction','--set','ON_ERROR_STOP=on','--command','SET session_replication_role=replica','--file','-','--dbname',pgEnv.PGDATABASE],sql);
  };
  async function ledger() { return (await db.query('select version from supabase_migrations.schema_migrations order by version')).rows; }
  async function snapshot() {
    const result = {};
    for (const table of [...tables,'_prisma_migrations']) {
      const rows = (await db.query(`SELECT row_to_json(t)::text AS row FROM public."${table}" t ORDER BY row_to_json(t)::text`)).rows;
      result[table] = {count:rows.length,digest:hash(JSON.stringify(rows))};
    }
    return result;
  }
  phase = 'local database connection';
  await db.connect();
  try {
    if (process.env.PG_DOCKER_CONTAINER) {
      phase = 'container and checked database identity binding';
      const identitySQL = "SELECT json_build_object('started',pg_postmaster_start_time()::text,'database',current_database())::text AS identity";
      const expected = JSON.parse((await db.query(identitySQL)).rows[0].identity);
      const actual = JSON.parse(execFileSync('docker',['exec','-i',process.env.PG_DOCKER_CONTAINER,'psql','-X','-At','--username','postgres','--dbname',pgEnv.PGDATABASE,'--command',identitySQL],{env:pgEnv,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).toString().trim());
      assert.deepEqual(actual,expected,'Container differs from checked local database');
    }
    if (mode === 'backup') {
      phase = 'synthetic fixture and quiescence validation';
      assert.equal(process.env.RECOVERY_QUIESCENT,'1','Stop application writers and set RECOVERY_QUIESCENT=1');
      assert(!fs.existsSync(path.join(dir,'manifest.json')), 'Backup already exists; use a fresh RECOVERY_DIR');
      const users = (await db.query('select id,email from auth.users order by id')).rows;
      assert.deepEqual(users,fixture.accounts.map(({id,email})=>({id,email})).sort((a,b)=>a.id.localeCompare(b.id)), 'Database contains accounts outside synthetic fixtures');
      const doctors = (await db.query('select id,email,name from public.dermatologists')).rows;
      assert(doctors.every(d=>fixture.accounts.some(a=>a.id===d.id&&a.email===d.email)&&d.name.startsWith('Synthetic')), 'Non-synthetic clinicians');
      for (const table of tables.filter(t=>!['user_profiles','dermatologists','skin_photos','care_routine_revisions','care_routine_completions'].includes(t))) assert.equal(Number((await db.query(`select count(*) from public."${table}"`)).rows[0].count),0,'Unexpected non-fixture clinical data');
      const revisions=(await db.query('select id,"userId","createdBy",name from public.care_routine_revisions')).rows;
      assert(revisions.length > 0 && revisions.every(r=>(fixture.routineRevisionIds||[]).includes(r.id) && fixture.accounts.some(a=>a.id===r.userId&&a.role.startsWith('patient')) && fixture.accounts.some(a=>a.id===r.createdBy&&a.role.startsWith('doctor')) && r.name.startsWith('Synthetic')), 'Non-fixture routine revision');
      const completions=(await db.query('select id,"userId","revisionId" from public.care_routine_completions')).rows;
      assert(completions.length > 0 && completions.every(c=>(fixture.routineCompletionIds||[]).includes(c.id) && revisions.some(r=>r.id===c.revisionId&&r.userId===c.userId)), 'Non-fixture routine completion');
      const profiles=(await db.query('select id,name from public.user_profiles')).rows;
      assert(profiles.every(p=>fixture.accounts.some(a=>a.id===p.id)&&p.name?.startsWith('Synthetic')), 'Non-synthetic profiles');
      const photos=(await db.query('select "userId",notes from public.skin_photos')).rows;
      assert(photos.every(p=>fixture.accounts.some(a=>a.id===p.userId)&&p.notes?.startsWith('Synthetic')), 'Non-synthetic photos');
      fs.mkdirSync(dir,{recursive:true,mode:0o700}); fs.chmodSync(dir,0o700);
      const syntheticPath = `${fixture.accounts[0].id}/recovery-${fixture.run}.txt`;
      fixture.paths = [...new Set([...(fixture.paths || []),syntheticPath])];
      // Record cleanup ownership before the upload so interrupted backups remain cleanable.
      fs.writeFileSync(statePath,JSON.stringify(fixture),{mode:0o600});
      fs.chmodSync(statePath,0o600);
      const uploaded = await admin.storage.from('patient-photos').upload(syntheticPath,Buffer.from(`Synthetic recovery ${fixture.run}`),{contentType:'text/plain',upsert:true});
      assert(!uploaded.error,'Synthetic object upload failed');
      const objects = (await db.query('select name,metadata from storage.objects where bucket_id=$1 order by name',['patient-photos'])).rows;
      assert(objects.every(o=>fixture.accounts.some(a=>o.name.startsWith(a.id+'/'))),'Unexpected storage owner');
      assert.equal(Number((await db.query("select count(*) from storage.objects where bucket_id <> 'patient-photos'")).rows[0].count),0,'Unexpected storage bucket data');
      const m = {version:1,createdAt:new Date().toISOString(),scope:'Quiescent synthetic local database/auth identities and object bytes; sessions, managed configuration and secrets excluded',ledger:await ledger(),files:{},objects:[]};
      write(dir,'fixtures.json',JSON.stringify(fixture)); write(dir,'snapshot.json',JSON.stringify(await snapshot()));
      phase = 'database archive export';
      pg('pg_dump',['--format=custom','--data-only','--no-owner','--no-privileges',...tables.flatMap(t=>['--table',`public.${t}`]),'--table','public._prisma_migrations','--table','auth.users','--table','auth.identities','--file',path.join(dir,'data.dump')]);
      fs.chmodSync(path.join(dir,'data.dump'),0o600);
      phase = 'storage byte export';
      for (const [i,obj] of objects.entries()) {
        const {data,error} = await admin.storage.from('patient-photos').download(obj.name); assert(!error,'Object download failed');
        const file = `object-${i}.bin`; write(dir,file,Buffer.from(await data.arrayBuffer()));
        m.objects.push({path:obj.name,file,contentType:obj.metadata?.mimetype||data.type||'application/octet-stream'});
      }
      for (const file of ['fixtures.json','snapshot.json','data.dump',...m.objects.map(o=>o.file)]) m.files[file]=hash(fs.readFileSync(path.join(dir,file)));
      assert.deepEqual(await snapshot(),JSON.parse(fs.readFileSync(path.join(dir,'snapshot.json'))),'Source changed during backup');
      write(dir,'manifest.json',JSON.stringify(m,null,2)); validate(dir);
      console.log('PASS synthetic database/auth/storage backup checksums; writers must remain stopped until source shutdown.');
    } else {
      phase = 'fresh destination and migration validation';
      assert.deepEqual(await ledger(),manifest.ledger,'Destination canonical migrations differ');
      for (const table of tables) assert.equal(Number((await db.query(`select count(*) from public."${table}"`)).rows[0].count),0,'Destination application data is not empty');
      for (const table of ['auth.users','auth.identities','storage.objects']) assert.equal(Number((await db.query(`select count(*) from ${table}`)).rows[0].count),0,'Destination managed data is not empty');
      assert.equal(Number((await db.query('select count(*) from public._prisma_migrations')).rows[0].count),0,'Destination Prisma ledger is not empty');
      phase = 'transactional database restore';
      pg('pg_restore',['--dbname',pgEnv.PGDATABASE,'--single-transaction','--exit-on-error','--data-only','--no-owner','--no-privileges',path.join(dir,'data.dump')]);
      assert.deepEqual(await snapshot(),JSON.parse(fs.readFileSync(path.join(dir,'snapshot.json'))),'Restored database differs');
      phase = 'private storage restore';
      const bucket = await admin.storage.getBucket('patient-photos'); assert(!bucket.error&&bucket.data.public===false,'Private bucket required');
      for (const obj of manifest.objects) {
        const bytes = fs.readFileSync(path.join(dir,obj.file));
        const upload=await admin.storage.from('patient-photos').upload(obj.path,bytes,{contentType:obj.contentType}); assert(!upload.error,'Object restore failed');
        const download=await admin.storage.from('patient-photos').download(obj.path); assert(!download.error,'Restored object missing');
        assert.equal(hash(Buffer.from(await download.data.arrayBuffer())),manifest.files[obj.file],'Restored object bytes differ');
        const denied=await publicClient().storage.from('patient-photos').download(obj.path); assert(denied.error,'Anonymous object access allowed');
      }
      phase = 'restored password and authorization checks';
      for (const account of fixture.accounts) {
        const client=publicClient(); const login=await client.auth.signInWithPassword({email:account.email,password:account.password}); assert(!login.error,'Restored password login failed');
        for (const table of ['user_profiles','care_routine_revisions','care_routine_completions']) { const denied=await client.from(table).select('id').limit(0); assert(denied.error,'Direct clinical access allowed'); }
      }
      phase = 'signup trigger verification';
      const email=`clearaf-security-${fixture.run}-recovery-signup@example.invalid`;
      const created=await admin.auth.admin.createUser({email,password:crypto.randomBytes(32).toString('hex'),email_confirm:true,user_metadata:{name:'Synthetic Recovery'}}); assert(!created.error,'Recovery signup failed');
      assert.equal(Number((await db.query('select count(*) from public.user_profiles where id=$1',[created.data.user.id])).rows[0].count),1,'Signup profile trigger failed');
      assert(!(await admin.auth.admin.deleteUser(created.data.user.id)).error,'Recovery signup cleanup failed');
      fs.mkdirSync(path.dirname(statePath),{recursive:true,mode:0o700}); fs.writeFileSync(statePath,JSON.stringify(fixture),{mode:0o600});fs.chmodSync(statePath,0o600);
      console.log('PASS fresh database/auth/storage restore, row digests, password logins, signup trigger and direct-access denial. Run full API authorization suite next.');
    }
  } finally { await db.end(); }
}
module.exports={local,validate,validateMigrationChain,applicationTables:tables};
if(require.main===module) run(process.argv[2]).catch(()=>{console.error(`Recovery drill failed during ${phase}; no credentials or database contents logged.`);process.exitCode=1;});
