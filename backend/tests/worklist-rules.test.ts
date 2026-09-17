import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADHERENCE_UNDER,WINDOW_DAYS,adherence,routineState,underThreshold,windowDates} from '../src/services/worklistAdherence';
import {worklistQuery} from '../src/services/worklistValidation';
const TODAY='2026-09-16';
const past=(days:number)=>new Date(Date.parse(`${TODAY}T00:00:00.000Z`)-days*86_400_000).toISOString().slice(0,10);
const LONG_AGO=new Date('2026-08-01T09:00:00.000Z');

test('the window is the 14 patient-local dates ending on the requested date',()=>{
 const dates=windowDates('2026-03-01');
 assert.equal(dates.length,WINDOW_DAYS);
 assert.deepEqual([dates[0],dates[12],dates[13]],['2026-02-16','2026-02-28','2026-03-01']);
});

test('the mock-up strip is 11 of 14 recorded days, which is 79%',()=>{
 const pattern=[1,2,0,2,2,1,0,2,2,1,2,0,2,2];
 const result=adherence(TODAY,LONG_AGO,new Map(pattern.map((n,i)=>[past(13-i),n])));
 assert.deepEqual([result.percent,result.completedDays,result.countedDays],[79,11,14]);
 assert.deepEqual(result.days.map(d=>d.routines),pattern);
 assert.deepEqual([result.days[0].localDate,result.days[13].localDate],[past(13),TODAY]);
});

test('today counts only once something is recorded, because the day is not over',()=>{
 const result=adherence(TODAY,LONG_AGO,new Map([[past(1),1]]));
 assert.equal(result.days[13].routines,null);
 assert.deepEqual([result.percent,result.completedDays,result.countedDays],[8,1,13]);
});

test('days before the first routine never count against the patient, but a completion always counts',()=>{
 const result=adherence(TODAY,new Date('2026-09-12T23:30:00.000Z'),new Map([['2026-09-12',1],['2026-09-14',2]]));
 assert.deepEqual(result.days.map(d=>d.routines),[null,null,null,null,null,null,null,null,null,1,0,2,0,null]);
 assert.deepEqual([result.percent,result.completedDays,result.countedDays],[50,2,4]);
});

test('a routine saved today with nothing recorded has no percentage; counts above two clamp',()=>{
 assert.equal(adherence(TODAY,new Date(`${TODAY}T07:00:00.000Z`),new Map()).percent,null);
 assert.equal(adherence(TODAY,LONG_AGO,new Map([[past(1),3]])).days[12].routines,2);
});

test('under the threshold means a real percentage below 60',()=>{
 const withPercent=(percent:number|null)=>({percent,completedDays:0,countedDays:0,days:[]});
 assert.equal(ADHERENCE_UNDER,60);
 assert.equal(underThreshold(withPercent(59)),true);
 assert.equal(underThreshold(withPercent(60)),false);
 assert.equal(underThreshold(withPercent(null)),false);
 assert.equal(underThreshold(null),false);
});

test('the latest revision per slot decides whether a routine is active; the first save starts the window',()=>{
 const r=(userId:string,timeOfDay:string,version:number,isActive:boolean,createdAt:string)=>({userId,timeOfDay,version,isActive,createdAt:new Date(createdAt)});
 const state=routineState([
  r('a','morning',2,false,'2026-09-02T00:00:00Z'),r('a','morning',1,true,'2026-08-01T00:00:00Z'),
  r('b','morning',1,false,'2026-08-05T00:00:00Z'),r('b','evening',1,true,'2026-08-03T00:00:00Z'),
 ]);
 assert.deepEqual([...state.active],['b']);
 assert.deepEqual([state.first.get('a')?.toISOString(),state.first.get('b')?.toISOString()],['2026-08-01T00:00:00.000Z','2026-08-03T00:00:00.000Z']);
});

test('worklist query: defaults, trimmed name search and a required local date',()=>{
 const d=worklistQuery.parse({localDate:TODAY});
 assert.deepEqual([d.filter,d.page,d.limit,d.search,d.localDate],['needs-review',1,20,undefined,TODAY]);
 const f=worklistQuery.parse({localDate:TODAY,filter:'flagged',page:'3',limit:'50',search:'  Ada  '});
 assert.deepEqual([f.filter,f.page,f.limit,f.search],['flagged',3,50,'Ada']);
 assert.equal(worklistQuery.parse({localDate:TODAY,search:'   '}).search,undefined);
 for(const query of [{},{localDate:'2026-02-30'},{localDate:TODAY,filter:'urgent'},{localDate:TODAY,page:'0'},{localDate:TODAY,page:'1.5'},{localDate:TODAY,page:'10001'},{localDate:TODAY,limit:'51'},{localDate:TODAY,page:['1']},{localDate:TODAY,search:'x'.repeat(101)},{localDate:TODAY,sort:'name'}])
  assert.equal(worklistQuery.safeParse(query).success,false,JSON.stringify(query));
});
