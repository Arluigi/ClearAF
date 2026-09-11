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
