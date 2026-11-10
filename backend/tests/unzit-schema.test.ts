import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {requirePatientCareScope} from '../src/services/careAccess';
// CI's ordinary unit-test job runs before local Supabase exists. Explicitly opt in
// to this fixed-loopback integration suite after starting/migrating that stack.
const schemaTest:typeof test=process.env.CI&&process.env.UNZIT_SCHEMA_TESTS!=='1'
 ? ((name:any,fn:any)=>test(name,{skip:'Local Supabase integration: set UNZIT_SCHEMA_TESTS=1 after stack setup'},fn)) as typeof test : test;
const tables=['launch_settings','launch_allowlist','launch_cases','launch_case_submissions','identity_verifications','intake_revisions','clinical_photo_sets','clinical_photo_set_items','care_memberships','billing_payments','billing_operations','stripe_events','launch_check_ins','launch_check_in_submissions','launch_reviews'];
// Fixed local connection: tests can never resolve hosted credentials.
const db=new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
schemaTest('launch tables deny both client roles and use RLS',async()=>{
 await db.connect();try{for(const table of tables){const r=await db.query('select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2',['public',table]);assert.equal(r.rows[0]?.relrowsecurity,true,table);for(const role of ['anon','authenticated']){const r=await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",[role,'public.'+table]);assert.equal(r.rows[0].allowed,false)}}}finally{await db.end()}
});
import {randomUUID} from 'node:crypto';
async function transaction(fn:(db:Client)=>Promise<void>){const c=new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres',connectionTimeoutMillis:3000});await c.connect();try{await c.query('BEGIN');await fn(c)}finally{await c.query('ROLLBACK');await c.end()}}
schemaTest('settings have positive server prices and immutable content',()=>transaction(async c=>{
 const {rows:[settings]}=await c.query('select * from public.launch_settings where active');assert.equal(settings.careAmountCents,3900);assert.equal(settings.allInAmountCents,8900);
 await assert.rejects(c.query('update public.launch_settings set "careAmountCents"=1 where id=$1',[settings.id]),{code:'23514'});
}));
schemaTest('direct Auth signup is denied atomically without an exact allowlist row',()=>transaction(async c=>{
 const id=randomUUID();await assert.rejects(c.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)',[id,'unlisted@example.invalid',{role:'admin',allowlisted:true}]),{code:'42501'});
}));
schemaTest('submitted intake timestamp and answers cannot be unfrozen',()=>transaction(async c=>{
 const id=randomUUID(),intakeId=randomUUID();
 await c.query('insert into public.launch_allowlist (email,"importBatch") values ($1,$2)',['schema-'+id+'@example.invalid',id]);
 await c.query('insert into auth.users(id,email) values ($1,$2)',[id,'schema-'+id+'@example.invalid']);
 const {rows:[caseRow]}=await c.query('select id from public.launch_cases where "patientId"=$1',[id]);
 assert.ok(caseRow,'Auth signup must provision the launch case');const caseId=caseRow.id;
 await c.query('insert into public.intake_revisions(id,"caseId","patientId","questionnaireVersion",answers,"requestHash","submittedAt") values ($1,$2,$3,$4,$5,$6,now())',[intakeId,caseId,id,'0.9-draft',{},'synthetic']);
 await assert.rejects(c.query('update public.intake_revisions set "submittedAt"=NULL where id=$1',[intakeId]),{code:'23514'});
}));

schemaTest('allowlisted Auth signup atomically creates one empty launch case regardless of role metadata',()=>transaction(async c=>{
 const {rows:[before]}=await c.query('select count(*)::int as total from public.user_profiles p where not exists (select 1 from public.launch_cases c where c."patientId"=p.id)');
 const id=randomUUID(),email='atomic-signup-'+id+'@example.invalid';
 await c.query('insert into public.launch_allowlist(email,"importBatch") values ($1,$2)',[email,id]);
 await c.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[id,email,{name:'Synthetic signup',role:'dermatologist',userType:'dermatologist',dermatologistId:randomUUID(),onboardingCompleted:true}]);
 const {rows}=await c.query('select * from public.launch_cases where "patientId"=$1',[id]);
 assert.equal(rows.length,1);const row=rows[0];assert.equal(row.status,'consents');assert.equal(row.revision,0);
 for(const key of ['eligibility','rulesVersion','planId','settingsVersion','destination','identityId','intakeId','photoSetId','submittedAt','approvedAt','patientMessage'])assert.equal(row[key],null,key);
 assert.deepEqual(row.flags,[]);
 const {rows:[profile]}=await c.query('select name,"dermatologistId","onboardingCompleted" from public.user_profiles where id=$1',[id]);
 assert.equal(profile.name,'Synthetic signup');assert.equal(profile.dermatologistId,null);assert.equal(profile.onboardingCompleted,false);
 assert.equal((await c.query('select 1 from public.dermatologists where id=$1',[id])).rowCount,0);
 const previous=process.env.ENROLLMENT_ENFORCEMENT;process.env.ENROLLMENT_ENFORCEMENT='off';
 try{
  const db={launchCase:{findUnique:async()=>row},careMembership:{findUnique:async()=>((await c.query('select * from public.care_memberships where "patientId"=$1',[id])).rows[0]??null)}};
  await assert.rejects(requirePatientCareScope(db,id,'clinical_write'),{statusCode:403,code:'CARE_ACCESS_REQUIRED'});
 }finally{if(previous===undefined)delete process.env.ENROLLMENT_ENFORCEMENT;else process.env.ENROLLMENT_ENFORCEMENT=previous}
 const {rows:[after]}=await c.query('select count(*)::int as total from public.user_profiles p where not exists (select 1 from public.launch_cases c where c."patientId"=p.id)');
 assert.equal(after.total,before.total,'Existing legacy profiles are not enrolled or backfilled');
 await c.query('SAVEPOINT client_role');await c.query('SET LOCAL ROLE authenticated');
 await assert.rejects(c.query('delete from public.launch_cases where "patientId"=$1',[id]),{code:'42501'});
 await c.query('ROLLBACK TO SAVEPOINT client_role');
 assert.equal((await c.query('select 1 from public.launch_cases where "patientId"=$1',[id])).rowCount,1);
}));
schemaTest('unallowlisted Auth signup leaves no Auth profile or launch case rows',()=>transaction(async c=>{
 const id=randomUUID();await c.query('SAVEPOINT denied_signup');
 await assert.rejects(c.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[id,'atomic-unlisted-'+id+'@example.invalid',{role:'dermatologist',allowlisted:true}]),{code:'42501'});
 await c.query('ROLLBACK TO SAVEPOINT denied_signup');
 for(const [table,column] of [['auth.users','id'],['public.user_profiles','id'],['public.launch_cases','"patientId"']])assert.equal((await c.query('select 1 from '+table+' where '+column+'=$1',[id])).rowCount,0,table);
}));
