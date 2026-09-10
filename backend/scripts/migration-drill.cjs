// A committed forward/backward DDL rehearsal on synthetic local data only.
const fs=require('node:fs'),assert=require('node:assert/strict');
require('dotenv').config({quiet:true});const{Client}=require('pg');const{snapshot,digest}=require('./schema-baseline.cjs');
(async()=>{
 require('./recovery-drill.cjs').local(process.env.DATABASE_URL,['postgres:','postgresql:']);
 const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();let added=false;
 try{
 const accounts=(await c.query('select email from auth.users')).rows;assert(accounts.length>0&&accounts.every(a=>a.email.startsWith('clearaf-security-')&&a.email.endsWith('@example.invalid')),'Synthetic populated database required');
 const before=await snapshot(c);const rows=async()=>(await c.query('select row_to_json(u)::text as row from public.user_profiles u order by id')).rows;
 const original=await rows();assert(original.length>0);
 await c.query('ALTER TABLE public.user_profiles ADD COLUMN t1_recovery_probe integer NOT NULL DEFAULT 7');added=true;
 const changed=(await c.query('select t1_recovery_probe from public.user_profiles')).rows;assert.equal(changed.length,original.length);assert(changed.every(r=>r.t1_recovery_probe===7));
 await c.query('ALTER TABLE public.user_profiles DROP COLUMN t1_recovery_probe');added=false;
 assert.deepEqual(await rows(),original);assert.equal(digest(await snapshot(c)),digest(before));
 fs.mkdirSync('../.local',{recursive:true});fs.writeFileSync('../.local/migration-drill.json',JSON.stringify({passed:true,rowsPreserved:original.length,forwardCommitted:true,rollbackCommitted:true,schemaUnchanged:true}));
 console.log('PASS committed forward migration and rollback preserve synthetic data and security schema');
 }finally{if(added)await c.query('ALTER TABLE public.user_profiles DROP COLUMN t1_recovery_probe');await c.end()}
})().catch(()=>{console.error('Local migration rehearsal failed');process.exitCode=1});
