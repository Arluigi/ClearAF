import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const {local,validate}=require('../scripts/recovery-drill.cjs');
test('recovery refuses hosted endpoints and connection query overrides',()=>{
 for(const url of ['postgresql://postgres@db.example.com/db','postgresql://postgres@localhost/db?host=remote','https://localhost.evil.test']) assert.throws(()=>local(url,['postgresql:','https:']));
 assert.doesNotThrow(()=>local('postgresql://postgres@127.0.0.1:54322/postgres',['postgresql:']));
});
test('all backup files are checked before restoration; missing and corrupt object rejected',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-test-'));
 try {
  const files:any={};
  for(const file of ['data.dump','fixtures.json','snapshot.json','object-0.bin']) {fs.writeFileSync(path.join(dir,file),'synthetic');files[file]=crypto.createHash('sha256').update('synthetic').digest('hex');}
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:1,files,objects:[{file:'object-0.bin',path:'synthetic/photo',contentType:'text/plain'}]}));
  assert.doesNotThrow(()=>validate(dir));
  fs.writeFileSync(path.join(dir,'object-0.bin'),'corrupt');assert.throws(()=>validate(dir),/checksum/);
  fs.unlinkSync(path.join(dir,'object-0.bin'));assert.throws(()=>validate(dir),/ENOENT/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('launch recovery freezes exact table keys and rejects unknown fixture rows',async()=>{
 const {validateCapturedRows}=require('../scripts/recovery-drill.cjs');
 const owned={launch_cases:[{id:'case-1',patientId:'patient-1'}],launch_settings:[{id:'settings-1',version:2}]};
 const digest=(value:any)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const fixture={version:1,completed:true,tableKeys:{launch_cases:['case-1'],launch_settings:['settings-1']},tableDigests:{launch_cases:digest(owned.launch_cases),launch_settings:digest(owned.launch_settings)}};
 assert.doesNotThrow(()=>validateCapturedRows(owned,fixture));
 assert.throws(()=>validateCapturedRows({...owned,launch_cases:[...owned.launch_cases,{id:'unknown',patientId:'patient-2'}]},fixture),/fixture/);
 assert.throws(()=>validateCapturedRows({...owned,launch_cases:[{id:'case-1',patientId:'unknown'}]},fixture),/digest/);
});
test('captured launch check-in submissions retain their response primary key',()=>{
 const {capturedRowKey}=require('../scripts/recovery-drill.cjs');
 assert.equal(capturedRowKey('launch_check_in_submissions',{responseId:'response-1'}),'response-1');
 assert.equal(capturedRowKey('launch_cases',{id:'case-1'}),'case-1');
});
test('recovery captures photo review and cleanup tables with their photo primary keys',async()=>{
 const {capturedRows,capturedRowKey}=require('../scripts/recovery-drill.cjs');
 for(const table of ['photo_reviews','photo_cleanup'])assert.equal(capturedRowKey(table,{photoId:'photo-1'}),'photo-1');
 let checked=0;await capturedRows({query:async(sql:string)=>{if(/public\."photo_(reviews|cleanup)"/.test(sql)){checked++;assert.match(sql,/ORDER BY "photoId"$/)}return{rows:[]}}});assert.equal(checked,2);
});
test('recovery checks unknown Auth counts before reading only exact known identities',async()=>{
 const {knownAuthRows}=require('../scripts/recovery-drill.cjs');let read=false;
 await assert.rejects(()=>knownAuthRows({query:async(sql:string)=>{if(sql.includes('SELECT id,email'))read=true;return{rows:[{count:'1'}]}}},['known']),/outside/);assert.equal(read,false);
 const queries:string[]=[];await knownAuthRows({query:async(sql:string,values:any[])=>{queries.push(sql);assert.deepEqual(values,[['known']]);return{rows:sql.includes('count(*)')?[{count:'0'}]:[]}}},['known']);assert.match(queries[1],/WHERE id=ANY\(\$1::uuid\[\]\)/);
});
