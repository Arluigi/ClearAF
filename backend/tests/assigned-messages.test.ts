import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageInput,readInput,pageInput,decodeCursor,encodeCursor,messageCursor} from '../src/services/assignedMessagesValidation';
const patientId='11111111-1111-4111-8111-111111111111',clinicianId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
test('strict bounded message and exact acknowledgement validation',()=>{
 assert.equal(messageInput.parse({content:' hi ',reference:null}).content,'hi');
 for(const body of [{content:' ',reference:null},{content:'x'.repeat(4001),reference:null},{content:'hi',reference:null,senderId:id},{content:'hi',reference:{type:'photo',id,url:'https://bad.invalid'}}])assert.equal(messageInput.safeParse(body).success,false);
 for(const messageIds of [[],[id,id],Array(51).fill(id),['bad']])assert.equal(readInput.safeParse({messageIds}).success,false);
 assert.equal(readInput.safeParse({messageIds:[id]}).success,true);
 for(const limit of ['0','51','2.5','1e1',' 2 ',['2']])assert.equal(pageInput.safeParse({limit}).success,false);
});
test('cursor rejects oversized, noncanonical, invalid precision and malformed positions',()=>{
 const value={v:1,patientId,clinicianId,id,sentAt:'2026-09-13T00:00:00.000Z'};
 assert.deepEqual(decodeCursor(encodeCursor(value),messageCursor),value);
 for(const cursor of ['a'.repeat(1025),'!',encodeCursor({...value,sentAt:'2026-02-30T00:00:00.000Z'}),encodeCursor({...value,sentAt:'2026-09-13T00:00:00.000001Z'}),encodeCursor({...value,extra:true})])assert.throws(()=>decodeCursor(cursor,messageCursor));
});
