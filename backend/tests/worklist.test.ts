import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
process.env.SUPABASE_URL='https://worklist-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
const P1='11111111-1111-4111-8111-111111111111',P2='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const TODAY='2026-09-16',at=(iso:string)=>new Date(iso);
const past=(days:number)=>new Date(Date.parse(`${TODAY}T00:00:00.000Z`)-days*86_400_000).toISOString().slice(0,10);
// The mock-up strip: index 0 is 13 days ago, index 13 is today; 11 of 14 days recorded.
const PATTERN=[1,2,0,2,2,1,0,2,2,1,2,0,2,2];
type Call={model:string;method:string;args:any};
let calls:Call[]=[],fixtures:Record<string,unknown>={},isolation:unknown;
// Recording Prisma model: every call is captured; results come from `fixtures['model.method']` (value, function of args, or Error).
const model=(name:string)=>new Proxy({},{get:(_target,method)=>async(args:any)=>{
 calls.push({model:name,method:String(method),args});
 const value=fixtures[`${name}.${String(method)}`];
 if(value instanceof Error)throw value;
 return typeof value==='function'?(value as (a:any)=>unknown)(args):value;
}});
const db:any={$transaction:async(fn:any,options?:any)=>{isolation=options?.isolationLevel;return fn(db)}};
for(const name of ['user','skinPhoto','assignedMessage','careFormResponse','careRoutineRevision','careRoutineCompletion','urgentReport'])db[name]=model(name);
function baseline(){
 fixtures={
  'user.count':({where}:any)=>where.skinPhotos||where.urgentReports?1:2,
  'user.findMany':({where}:any)=>where.id
   ?[{id:P1,name:'Synthetic Ada',joinDate:at('2026-03-02T00:00:00.000Z')},{id:P2,name:'Synthetic Ben',joinDate:at('2026-05-19T00:00:00.000Z')}].filter(u=>where.id.in.includes(u.id))
   :[{id:P2},{id:P1}],
  'skinPhoto.aggregate':{_count:{_all:3},_min:{createdAt:at('2026-09-12T08:00:00.000Z')}},
  'skinPhoto.groupBy':({orderBy}:any)=>orderBy?[{userId:P1,_min:{createdAt:at('2026-09-12T08:00:00.000Z')}}]:[{userId:P1,_count:{_all:3},_min:{createdAt:at('2026-09-12T08:00:00.000Z')}}],
  'assignedMessage.groupBy':[{patientId:P1,_count:{_all:2}}],
  'careFormResponse.count':1,
  'careFormResponse.groupBy':[{userId:P1,_max:{receivedAt:at('2026-09-15T07:04:00.000Z')}}],
  'careRoutineRevision.findMany':[
   {id:'rev-p1-morning',userId:P1,timeOfDay:'morning',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
   {id:'rev-p1-evening',userId:P1,timeOfDay:'evening',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
   {id:'rev-p2-morning-v1',userId:P2,timeOfDay:'morning',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
   {id:'rev-p2-morning-v2',userId:P2,timeOfDay:'morning',version:2,isActive:false,createdAt:at('2026-09-01T09:00:00.000Z')},
  ],
  // One row per completed slot (grouped by revision), same shape the fixed query returns — a same-day
  // revision change for one slot would be two rows here but still one slot once mapped back to timeOfDay.
  'careRoutineCompletion.groupBy':PATTERN.flatMap((n,i)=>['morning','evening'].slice(0,n).map(timeOfDay=>({userId:P1,localDate:past(13-i),revisionId:timeOfDay==='morning'?'rev-p1-morning':'rev-p1-evening',_count:{_all:1}}))),
  'careRoutineCompletion.findMany':PATTERN.flatMap((n,i)=>['morning','evening'].slice(0,n).map(timeOfDay=>({userId:P1,localDate:past(13-i),routine:{timeOfDay}}))),
  'urgentReport.groupBy':({orderBy}:any)=>orderBy?[{patientId:P2,_min:{createdAt:at('2026-09-14T10:00:00.000Z')}}]:[{patientId:P2,status:'open',_count:{_all:1},_min:{createdAt:at('2026-09-14T10:00:00.000Z')}}],
 };
}
const originalLoad=(Module as any)._load;
(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{TransactionIsolationLevel:{RepeatableRead:'RepeatableRead'}}};return originalLoad.call(this,name,...args)};
const app=express();
app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:id===C?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/worklist',require('../src/routes/worklist').default);app.use(require('../src/middleware/errorHandler').errorHandler);
(Module as any)._load=originalLoad;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/worklist`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{calls=[];isolation=undefined;baseline()});
async function call(path:string,who:string=C){const r=await fetch(base+path,{headers:{'x-identity':who}});return {status:r.status,body:await r.json().catch(()=>({})) as any}}

test('only clinicians can read the worklist',async()=>{
 assert.equal((await call(`/?localDate=${TODAY}`,P1)).status,403);
 assert.equal((await fetch(`${base}/?localDate=${TODAY}`)).status,401);
 assert.equal(calls.length,0);
});

test('the query is strictly validated before any database read',async()=>{
 for(const query of ['','localDate=2026-02-30','localDate=16-09-2026',`localDate=${TODAY}&filter=urgent`,`localDate=${TODAY}&page=0`,`localDate=${TODAY}&page=1.5`,`localDate=${TODAY}&page=10001`,`localDate=${TODAY}&limit=51`,`localDate=${TODAY}&search=${'x'.repeat(101)}`,`localDate=${TODAY}&sort=name`,`localDate=${TODAY}&page=1&page=2`]){
  const r=await call('/?'+query);
  assert.equal(r.status,400,query);assert.equal(r.body.code,'VALIDATION_ERROR',query);
 }
 assert.equal(calls.length,0);
});

test('needs review returns the four counts and review-queue rows, scoped to the clinician in one snapshot',async()=>{
 const r=await call(`/?localDate=${TODAY}`);
 assert.equal(r.status,200);
 const since=r.body.summary.checkInsSubmitted.since;
 assert.ok(Math.abs(Date.parse(since)-(Date.now()-7*86_400_000))<60_000);
 assert.deepEqual(r.body.summary,{assignedPatients:2,photosToReview:{count:3,oldestUploadAt:'2026-09-12T08:00:00.000Z'},unreadMessages:{count:2,patients:1},checkInsSubmitted:{count:1,since,days:7},adherenceUnderThreshold:{count:0,threshold:60,windowDays:14}});
 assert.deepEqual(r.body.data,[{patientId:P1,name:'Synthetic Ada',joinedAt:'2026-03-02T00:00:00.000Z',photos:{unreviewedCount:3,oldestUploadAt:'2026-09-12T08:00:00.000Z'},unreadMessages:2,latestCheckInAt:'2026-09-15T07:04:00.000Z',urgent:{open:0,acknowledged:0,oldestAt:null},adherence:{percent:79,completedDays:11,countedDays:14,days:PATTERN.map((routines,i)=>({localDate:past(13-i),routines}))}}]);
 assert.deepEqual(r.body.pagination,{page:1,limit:20,total:1,totalPages:1});
 assert.deepEqual([r.body.filter,r.body.localDate],['needs-review',TODAY]);
 const queue=calls.find(c=>c.model==='skinPhoto'&&c.method==='groupBy'&&c.args.orderBy)!;
 assert.deepEqual(queue.args.orderBy,[{_min:{createdAt:'asc'}},{userId:'asc'}]);
 assert.deepEqual(queue.args.where,{review:{is:null},user:{dermatologistId:C}});
 assert.deepEqual([queue.args.skip,queue.args.take],[0,20]);
 const unread=calls.find(c=>c.model==='assignedMessage'&&c.method==='groupBy')!;
 assert.deepEqual(unread.args,{by:['patientId'],where:{clinicianId:C,recipientId:C,recipientType:'dermatologist',readAt:null,patient:{dermatologistId:C}},_count:{_all:true}});
 for(const c of calls)assert.ok(JSON.stringify(c.args.where).includes(C),`${c.model}.${c.method} is not scoped to the clinician`);
 assert.equal(isolation,'RepeatableRead');
});

test('adherence under the threshold counts only patients with an active routine, from recorded days',async()=>{
 fixtures['careRoutineRevision.findMany']=[...(fixtures['careRoutineRevision.findMany'] as any[]),{id:'rev-p2-morning-v3',userId:P2,timeOfDay:'morning',version:3,isActive:true,createdAt:at('2026-09-02T09:00:00.000Z')}];
 let r=await call(`/?filter=all&localDate=${TODAY}`);
 assert.equal(r.body.summary.adherenceUnderThreshold.count,1);
 const ben=r.body.data.find((p:any)=>p.patientId===P2);
 assert.deepEqual([ben.adherence.percent,ben.adherence.completedDays,ben.adherence.countedDays],[0,0,13]);
 baseline();
 r=await call(`/?filter=all&localDate=${TODAY}`);
 assert.equal(r.body.summary.adherenceUnderThreshold.count,0);
 assert.equal(r.body.data.find((p:any)=>p.patientId===P2).adherence,null);
});

test('a same-day revision change for the same slot counts once, not twice, in both the summary and the row',async()=>{
 // CareRoutineCompletion is unique on (userId, revisionId, localDate): a revision change mid-day for the
 // same slot yields two completion rows on one day for one slot, not two slots.
 const changedDay=past(3);
 fixtures['careRoutineRevision.findMany']=[
  {id:'rev-p1-morning-a',userId:P1,timeOfDay:'morning',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
  {id:'rev-p1-morning-b',userId:P1,timeOfDay:'morning',version:2,isActive:true,createdAt:at('2026-09-10T09:00:00.000Z')},
  {id:'rev-p2-morning-v1',userId:P2,timeOfDay:'morning',version:1,isActive:true,createdAt:at('2026-08-01T09:00:00.000Z')},
 ];
 fixtures['careRoutineCompletion.groupBy']=[
  {userId:P1,localDate:changedDay,revisionId:'rev-p1-morning-a',_count:{_all:1}},
  {userId:P1,localDate:changedDay,revisionId:'rev-p1-morning-b',_count:{_all:1}},
 ];
 fixtures['careRoutineCompletion.findMany']=[
  {userId:P1,localDate:changedDay,routine:{timeOfDay:'morning'}},
  {userId:P1,localDate:changedDay,routine:{timeOfDay:'morning'}},
 ];
 const r=await call(`/?localDate=${TODAY}`);
 const ada=r.body.data.find((p:any)=>p.patientId===P1);
 // The row: one slot recorded that day, not two.
 assert.equal(ada.adherence.days.find((d:any)=>d.localDate===changedDay)?.routines,1);
 assert.deepEqual([ada.adherence.completedDays,ada.adherence.countedDays],[1,13]);
 // The summary: both patients are below 60% from this one recorded slot (or none for P2), not pulled
 // above threshold by double-counting the revision change as a full day.
 assert.equal(r.body.summary.adherenceUnderThreshold.count,2);
 // The fix: the completion query groups by revision (not just day), so same-slot rows can be told apart
 // from different-slot rows before they are folded into a day's distinct slot count.
 const groupBy=calls.find(c=>c.model==='careRoutineCompletion'&&c.method==='groupBy')!;
 assert.deepEqual(groupBy.args.by,['userId','localDate','revisionId']);
});

test('flagged and all patients use their own order, search and totals',async()=>{
 let r=await call(`/?filter=flagged&search=%20ada%20&page=2&limit=5&localDate=${TODAY}`);
 assert.equal(r.status,200);
 const flagged=calls.find(c=>c.model==='urgentReport'&&c.args.orderBy)!;
 assert.deepEqual(flagged.args,{by:['patientId'],where:{status:{not:'resolved'},patient:{dermatologistId:C,name:{contains:'ada',mode:'insensitive'}}},_min:{createdAt:true},orderBy:[{_min:{createdAt:'asc'}},{patientId:'asc'}],skip:5,take:5});
 assert.deepEqual(calls.find(c=>c.model==='user'&&c.method==='count'&&c.args.where.urgentReports)!.args.where,{dermatologistId:C,name:{contains:'ada',mode:'insensitive'},urgentReports:{some:{status:{not:'resolved'}}}});
 assert.deepEqual(r.body.data.map((p:any)=>[p.patientId,p.urgent]),[[P2,{open:1,acknowledged:0,oldestAt:'2026-09-14T10:00:00.000Z'}]]);
 assert.deepEqual(r.body.pagination,{page:2,limit:5,total:1,totalPages:1});
 calls=[];
 r=await call(`/?filter=all&localDate=${TODAY}`);
 const list=calls.find(c=>c.model==='user'&&c.method==='findMany'&&!c.args.where.id)!;
 assert.deepEqual(list.args,{where:{dermatologistId:C},orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:0,take:20,select:{id:true}});
 assert.deepEqual(r.body.data.map((p:any)=>p.patientId),[P2,P1]);
});

test('an empty page makes no per-patient reads',async()=>{
 fixtures['skinPhoto.groupBy']=()=>[];
 fixtures['user.count']=({where}:any)=>where.skinPhotos?0:2;
 const r=await call(`/?localDate=${TODAY}`);
 assert.deepEqual([r.body.data,r.body.pagination],[[],{page:1,limit:20,total:0,totalPages:0}]);
 assert.deepEqual(calls.map(c=>`${c.model}.${c.method}`).filter(n=>['user.findMany','careFormResponse.groupBy','urgentReport.groupBy','careRoutineCompletion.findMany'].includes(n)),[]);
 assert.equal(calls.filter(c=>c.model==='skinPhoto'&&c.method==='groupBy').length,1);
});

test('unexpected failures are not leaked',async()=>{
 fixtures['user.count']=new Error('synthetic database detail');
 const r=await call(`/?localDate=${TODAY}`);
 assert.deepEqual([r.status,r.body],[500,{error:'WORKLIST_OPERATION_FAILED',code:'WORKLIST_OPERATION_FAILED'}]);
});
