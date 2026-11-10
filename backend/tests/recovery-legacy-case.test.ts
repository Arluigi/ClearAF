import test from 'node:test';import assert from 'node:assert/strict';
const fixture={id:'22222222-2222-4222-8222-222222222222',run:'11111111-1111-4111-8111-111111111111',role:'patientA',email:'clearaf-security-11111111-1111-4111-8111-111111111111-patienta@example.invalid'};
const row={id:'33333333-3333-4333-8333-333333333333',patientId:fixture.id,revision:0,status:'consents',eligibility:null,rulesVersion:null,planId:null,settingsVersion:null,destination:null,identityId:null,intakeId:null,photoSetId:null,flags:[],submittedAt:null,approvedAt:null,patientMessage:null};
const env={DATABASE_URL:'postgresql://postgres:test@127.0.0.1:55322/postgres',SUPABASE_URL:'http://127.0.0.1:55321',SECURITY_API_URL:'http://127.0.0.1:3002/api'};
test('legacy helper refuses non-empty, launch-patient, non-synthetic and nonloopback cases',async()=>{
 const {removeEmptyLegacyFixtureCase}=require('../scripts/lib/legacy-fixture-case.cjs');
 for(const changed of [{revision:1},{status:'identity'},{identityId:'existing'},{flags:['existing']},{destination:{}},{submittedAt:new Date()}]){
  let deleted=false;const db={query:async(sql:string)=>{if(sql.startsWith('DELETE'))deleted=true;return{rows:sql.includes('auth.users')?[{id:fixture.id}]:sql.includes('SELECT *')?[{...row,...changed}]:[],rowCount:1}}};
  await assert.rejects(()=>removeEmptyLegacyFixtureCase(db,fixture,{env}),/empty/);assert.equal(deleted,false);
 }
 for(const input of [{...fixture,role:'launchA'},{...fixture,email:'real@example.com'}])await assert.rejects(()=>removeEmptyLegacyFixtureCase({query:async()=>{throw Error('must not query')}},input,{env}),/fixture/);
 await assert.rejects(()=>removeEmptyLegacyFixtureCase({},fixture,{env:{...env,DATABASE_URL:'postgresql://postgres@db.example.com/postgres'}}),/nonloopback/);
});
test('legacy helper proves exact Auth and import run and records intent before scoped empty-case deletion',async()=>{
 const {removeEmptyLegacyFixtureCase}=require('../scripts/lib/legacy-fixture-case.cjs');const sequence:string[]=[];
 const db={query:async(sql:string,values:any[])=>{sequence.push(sql.split(' ')[0]);if(sql.includes('auth.users')){assert.deepEqual(values,[fixture.id,fixture.email,fixture.run]);return{rows:[{id:fixture.id}]}}if(sql.startsWith('SELECT *'))return{rows:[row]};if(sql.startsWith('DELETE')){assert.equal(sequence[sequence.length-2],'intent');assert.match(sql,/NOT EXISTS/);assert.match(sql,/revision=0/);return{rows:[],rowCount:1}}return{rows:[]}}};
 await removeEmptyLegacyFixtureCase(db,fixture,{env,recordIntent:async(id:string)=>{assert.equal(id,row.id);sequence.push('intent')}});assert(sequence.includes('COMMIT'));
});
test('legacy helper cannot delete without exact Auth/email/allowlist proof or when a child blocks deletion',async()=>{
 const {removeEmptyLegacyFixtureCase}=require('../scripts/lib/legacy-fixture-case.cjs');
 for(const proof of [false,true]){const db={query:async(sql:string)=>({rows:sql.includes('auth.users')?(proof?[{id:fixture.id}]:[]):sql.startsWith('SELECT *')?[row]:[],rowCount:0})};await assert.rejects(()=>removeEmptyLegacyFixtureCase(db,fixture,{env}),proof?/child|empty/:/identity/)}
});
