import test from 'node:test';import assert from 'node:assert/strict';
const {integrationRuntime,validateManifest}=require('../scripts/unzit-integration-live.cjs');
const status={API_URL:'http://127.0.0.1:54321',DB_URL:'postgresql://postgres:postgres@127.0.0.1:54322/postgres',ANON_KEY:'synthetic-anon',SERVICE_ROLE_KEY:'synthetic-service'};
test('integration live runtime is pinned to the local stack and fake adapter, never inherited hosted targets',()=>{
 const env=integrationRuntime(status);assert.equal(env.BILLING_PROVIDER,'fake');assert.equal(env.SECURITY_API_URL,'http://127.0.0.1:3001/api');
 for(const patch of [{API_URL:'https://hosted.example.invalid'},{DB_URL:'postgresql://hosted.example.invalid/postgres'},{API_URL:'http://127.0.0.1:55321'},{SERVICE_ROLE_KEY:''}])assert.throws(()=>integrationRuntime({...status,...patch}));
});
test('integration manifest only permits exact per-run synthetic identities',()=>{
 const run='00000000-0000-4000-8000-000000000001';const manifest={run,accounts:[{role:'patientA',email:`clearaf-integration-${run}-patienta@example.invalid`}]};
 assert.doesNotThrow(()=>validateManifest(manifest));
 for(const email of ['real@example.com',`clearaf-ui-${run}@example.invalid`,`clearaf-integration-other-patienta@example.invalid`])assert.throws(()=>validateManifest({...manifest,accounts:[{role:'patientA',email}]}));
});
test('loopback transport rejects hosted targets and prevents redirect following',async()=>{
 const {loopbackFetch}=require('../scripts/unzit-integration-live.cjs');let calls=0;
 const transport=async(_url:any,options:any)=>{calls++;assert.equal(options.redirect,'error');return new Response('{}');};
 await loopbackFetch('http://127.0.0.1:3001/ready',{},transport);assert.equal(calls,1);
 await assert.rejects(loopbackFetch('https://hosted.example.invalid',{},transport));assert.equal(calls,1);
});
