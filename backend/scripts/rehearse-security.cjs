const fs = require('node:fs');
const { Client } = require('pg');
require('dotenv').config({quiet:true});
(async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});
 await client.connect();
 try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query(fs.readFileSync('../supabase/migrations/20260910175558_restrict_clinical_data_access.sql','utf8'));
  const {rows}=await client.query(`select c.relname, c.relrowsecurity, has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access, has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as user_access, has_any_column_privilege('authenticated',c.oid,'UPDATE') as column_update from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
  if(rows.some(r=>!r.relrowsecurity||r.anon_access||r.user_access||r.column_update))throw Error('Remaining client privileges');
  const functions=await client.query("select has_function_privilege('anon','public.handle_new_user()','EXECUTE') as exposed");
  if(functions.rows[0].exposed)throw Error('Trigger callable by anonymous client');
  const applying = process.argv.includes('--apply');
  await client.query(applying ? 'COMMIT' : 'ROLLBACK');
  console.log(`PASS: transactional migration rehearsal for ${rows.length} tables; client grants removed; RLS enabled; trigger restricted; ${applying ? "APPLIED" : "rolled back"}.`);
 } finally {await client.query('ROLLBACK').catch(()=>{});await client.end()}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
