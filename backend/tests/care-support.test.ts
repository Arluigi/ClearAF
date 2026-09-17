import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {formInput,responseInput,validateAnswers,monthInput,monthBounds,timelineQuery,localDateIn,daySpan} from '../src/services/careSupportValidation';
const q={id:randomUUID(),prompt:'Neutral prompt',type:'choice' as const,required:true,options:[{id:randomUUID(),label:'First'},{id:randomUUID(),label:'Second'}]};
const body={expectedRevisionId:null,title:'Neutral form',isActive:true,questions:[q]};
test('strict forms reject duplicate identities, wrong shape and bounds',()=>{assert.equal(formInput.safeParse(body).success,true);for(const patch of [{questions:[]},{questions:[q,q]},{title:' '},{createdBy:randomUUID()},{questions:[{...q,options:[]}]},{questions:[{...q,options:[q.options[0],q.options[0]]}]}])assert.equal(formInput.safeParse({...body,...patch}).success,false);assert.equal(formInput.safeParse({...body,isActive:false,questions:[]}).success,true)});
test('answers reject missing required, unknown, duplicate and wrong type choices',()=>{const answer={questionId:q.id,optionId:q.options[0].id};assert.doesNotThrow(()=>validateAnswers([q],[answer]));for(const answers of [[],[answer,answer],[{questionId:q.id,text:'wrong'}],[{questionId:q.id,optionId:randomUUID()}],[{questionId:randomUUID(),text:'unknown'}]])assert.throws(()=>validateAnswers([q],answers));assert.throws(()=>validateAnswers([{...q,type:'text',options:[]}],[{questionId:q.id,text:' '}]))});
test('month bounds handle leap years and December rollover, invalid month rejected',()=>{assert.deepEqual(monthBounds('2026-12'),{start:'2026-12-01',end:'2027-01-01'});for(const month of ['2026-13','2026-00','26-01','2026-1'])assert.equal(monthInput.safeParse(month).success,false)});
test('response strict shape, skew and finite ISO timestamp',()=>{const value={formId:randomUUID(),submittedAt:'2026-01-01T00:00:00Z',answers:[]};assert.equal(responseInput.safeParse(value).success,true);for(const patch of [{submittedAt:'2026-02-30T00:00:00Z'},{submittedAt:new Date(Date.now()+600000).toISOString()},{userId:randomUUID()},{answers:[{questionId:q.id,text:'x'.repeat(2001)}]}])assert.equal(responseInput.safeParse({...value,...patch}).success,false)});
test('timeline query needs ordered ISO instants at most 1096 days apart and an IANA zone',()=>{
 const ok={from:'2026-09-02T07:04:00.000Z',to:'2026-09-15T07:12:00.000Z',timeZone:'America/New_York'};
 assert.equal(timelineQuery.safeParse(ok).success,true);
 assert.equal(timelineQuery.safeParse({...ok,to:ok.from}).success,true,'a same-instant pair is allowed');
 for(const patch of [{to:'2026-09-01T00:00:00.000Z'},{from:'2023-09-01T00:00:00.000Z'},{from:'2026-02-30T00:00:00Z'},{from:'yesterday'},{timeZone:'+05:30'},{timeZone:'Mars/Olympus'},{timeZone:''},{extra:'1'}])
  assert.equal(timelineQuery.safeParse({...ok,...patch}).success,false,JSON.stringify(patch));
 assert.equal(timelineQuery.safeParse({from:ok.from,to:ok.to}).success,false,'timeZone is required');
});
test('timeline local dates follow the requested zone and day spans are inclusive',()=>{
 assert.equal(localDateIn(new Date('2026-09-02T20:00:00Z'),'Asia/Kolkata'),'2026-09-03');
 assert.equal(localDateIn(new Date('2026-09-02T03:00:00Z'),'America/Los_Angeles'),'2026-09-01');
 assert.equal(daySpan('2026-09-02','2026-09-15'),14);
 assert.equal(daySpan('2026-09-15','2026-09-15'),1);
 assert.equal(daySpan('2024-02-28','2024-03-01'),3);
});
