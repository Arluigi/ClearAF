// Schema-only comparison. Reconciliation changes migration metadata only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{Client}=require('pg'),dotenv=require('dotenv');dotenv.config({quiet:true});
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const queries={
 columns:`select table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale,datetime_precision from information_schema.columns where table_schema='public' order by table_name,ordinal_position`,
 tables:`select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`,
 constraints:`select c.relname,k.conname,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.conname`,
 indexes:`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`,
 functions:`select p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user' order by p.proname`,
 triggers:`select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal and tgfoid='public.handle_new_user()'::regprocedure order by tgname`,
 policies:`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects') order by schemaname,tablename,policyname`,
 grants:`select c.relname,r.rolname,p.permission,has_table_privilege(r.rolname,c.oid,p.permission) as allowed from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'),('authenticated'),('service_role')) r(rolname) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(permission) where n.nspname='public' and c.relkind='r' order by c.relname,r.rolname,p.permission`,
 functionGrants:`select r.rolname,has_function_privilege(r.rolname,'public.handle_new_user()','EXECUTE') as allowed from (values ('anon'),('authenticated'),('service_role')) r(rolname) order by r.rolname`,
 defaults:`select coalesce(n.nspname,'GLOBAL') as schema,d.defaclobjtype,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,a.privilege_type,a.is_grantable from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='postgres'::regrole and (n.nspname='public' or d.defaclnamespace=0) order by 1,2,3,4,5`,
 bucket:`select id,name,public from storage.buckets where id='patient-photos' order by id`
};
async function snapshot(c){const out={};for(const[k,q]of Object.entries(queries))out[k]=(await c.query(q)).rows;return out}
async function ledger(c){const exists=(await c.query("select to_regclass('supabase_migrations.schema_migrations') is not null as yes")).rows[0].yes;return{prisma:(await c.query('select migration_name,checksum,finished_at,rolled_back_at from public._prisma_migrations order by migration_name')).rows,supabase:exists?(await c.query('select version,name,statements from supabase_migrations.schema_migrations order by version')).rows:[]}}
async function run(){
 if(!process.env.SCHEMA_REFERENCE_ENV)throw Error('SCHEMA_REFERENCE_ENV must explicitly name reference configuration');
 const ref=dotenv.parse(fs.readFileSync(process.env.SCHEMA_REFERENCE_ENV));
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Baseline source must be local');
 const local=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});const remote=new Client({connectionString:ref.DIRECT_URL||ref.DATABASE_URL,connectionTimeoutMillis:5000});
 try{
 await local.connect();await remote.connect();
 const expected=await snapshot(local),before=await snapshot(remote),history=await ledger(remote),canonical=await ledger(local);
 fs.mkdirSync('../.local',{recursive:true});
 const differences=Object.keys(queries).filter(k=>digest(expected[k])!==digest(before[k]));
 fs.writeFileSync('../.local/schema-comparison.json',JSON.stringify({expected,before,differences,history},null,2),{mode:0o600});
 if(differences.length)throw Error('Schema/security drift in: '+differences.join(', '));
 const approved=JSON.parse(fs.readFileSync('../supabase/baseline.json'));
 const approvedFile=fs.readFileSync('../supabase/migrations/'+approved.version+'_application_baseline.sql');
 if(crypto.createHash('sha256').update(approvedFile).digest('hex')!==approved.fileSha256 || digest(expected)!==approved.schemaFingerprint) throw Error('Approved baseline fingerprint mismatch');
 const row=canonical.supabase[0];if(canonical.supabase.length!==1||row.name!=='application_baseline')throw Error('Expected one canonical baseline');
 if(row.version!==approved.version||row.name!==approved.name||digest(row.statements)!==approved.statementsSha256)throw Error('Approved migration statements mismatch');
 if(history.supabase.some(r=>r.version!==row.version||digest(r.statements)!==digest(row.statements)))throw Error('Unexpected reference migration history');
 if(process.argv.includes('--reconcile-reference')){
  await remote.query('BEGIN');
  try{
   await remote.query("SET LOCAL lock_timeout='3s'");
   await remote.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
   await remote.query('CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY, statements text[], name text)');
   await remote.query('INSERT INTO supabase_migrations.schema_migrations (version,statements,name) VALUES ($1,$2,$3) ON CONFLICT(version) DO NOTHING',[row.version,row.statements,row.name]);
   const stored=(await ledger(remote)).supabase;
   if(stored.length!==1||stored[0].version!==row.version||stored[0].name!==row.name||digest(stored[0].statements)!==digest(row.statements))throw Error('Conflicting canonical ledger');
   if(digest(await snapshot(remote))!==digest(before))throw Error('Application schema changed during reconciliation');
   await remote.query('COMMIT');
  }catch(e){await remote.query('ROLLBACK');throw e}
 }
 const after=await snapshot(remote),final=await ledger(remote);
 if(digest(after)!==digest(before)||digest(final.prisma)!==digest(history.prisma))throw Error('Schema or historical Prisma ledger changed');
 const result={verifiedAt:new Date().toISOString(),schemaFingerprint:digest(after),baselineVersion:row.version,baselineFileSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join('..','supabase','migrations',row.version+'_application_baseline.sql'))).digest('hex'),parity:true,pending:canonical.supabase.filter(r=>!final.supabase.some(x=>x.version===r.version)).map(x=>x.version),historicalPrismaPreserved:true,reconciled:process.argv.includes('--reconcile-reference')};
 fs.writeFileSync('../.local/schema-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await local.end();await remote.end()}
}
if(require.main===module)run().catch(e=>{console.error('Baseline verification failed',typeof e.code==='string'&&/^[A-Z0-9]{5}$/.test(e.code)?e.code:'CHECK_FAILED');process.exitCode=1});
module.exports={snapshot,ledger,digest};
