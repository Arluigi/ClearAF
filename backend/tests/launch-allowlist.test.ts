import {test} from 'node:test';
import assert from 'node:assert/strict';
const {parseWaitlist,importWaitlist}=require('../scripts/import-waitlist.cjs');
test('BOM, quoted CSV, mixed-case and duplicate emails normalize',()=>{assert.deepEqual(parseWaitlist('\ufeffname,email\r\n"Example, Synthetic", SYNTHETIC@example.invalid \r\nSecond,synthetic@example.invalid\n'),['synthetic@example.invalid'])});
test('invalid CSV never produces a partial import',()=>{for(const csv of ['name\nTest','email\ninvalid','email\n"unterminated','email,email\na@example.invalid,b@example.invalid','email\na@example.invalid,x'])assert.throws(()=>parseWaitlist(csv))});
test('default dry-run never opens a write transaction; apply is atomic and count-only',async()=>{
 const queries:any[]=[];const db={query:async(...args:any[])=>{queries.push(args);return {rowCount:1}}};
 assert.deepEqual(await importWaitlist(db,'email\na@example.invalid'),{parsed:1,applied:0});assert.equal(queries.length,0);
 assert.deepEqual(await importWaitlist(db,'email\na@example.invalid',{apply:true}),{parsed:1,applied:1});assert.equal(queries[0][0],'BEGIN');assert.equal(queries.at(-1)[0],'COMMIT');
});
test('import failure rolls back the entire batch',async()=>{const queries:string[]=[];const db={query:async(s:string)=>{queries.push(s);if(s.startsWith('INSERT'))throw Error('synthetic failure')}};await assert.rejects(importWaitlist(db,'email\na@example.invalid',{apply:true}));assert.equal(queries.at(-1),'ROLLBACK')});
test('multiple @ delimiters are invalid',()=>assert.throws(()=>parseWaitlist('email\na@b@example.invalid')));
