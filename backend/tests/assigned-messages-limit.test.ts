import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Module from 'node:module';
import express from 'express';
// Role middleware initializes its Supabase client; these tests use synthetic identity and DB stubs.
process.env.SUPABASE_URL='https://assigned-messages-limit-test.supabase.co';
process.env.SUPABASE_ANON_KEY='synthetic';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
process.env.ENROLLMENT_ENFORCEMENT='off'; // The gate itself is covered by enrollment-gate.test.ts.
const WEEK=7*86_400_000;
const A=randomUUID(),C=randomUUID(),D=randomUUID();
let rows:any[]=[],reports:any[]=[],assigned=C,queue=Promise.resolve();
// Simulated wall clock for direct service calls that inject a `now`, so a created row's sentAt lines
// up with the same instant the limit check reasons about (real Date() otherwise, for HTTP round trips).
let clock:Date|null=null;
function matches(row:any,where:any={}):boolean{return Object.entries(where).every(([key,value]:any)=>{if(key==='OR')return value.some((v:any)=>matches(row,v));if(value&&typeof value==='object'&&!(value instanceof Date)){if('in' in value)return value.in.includes(row[key]);if('lt' in value)return row[key]<value.lt;if('gte' in value)return row[key]>=value.gte;}return value instanceof Date?row[key]?.getTime()===value.getTime():row[key]===value})}
function model(get:()=>any[]){return {findUnique:async({where}:any)=>get().find(r=>matches(r,where))??null,findFirst:async(args:any)=>(await model(get).findMany(args))[0]??null,findMany:async({where,orderBy,take}:any={})=>{const found=get().filter(r=>matches(r,where));if(orderBy)found.sort((a,b)=>{for(const order of Array.isArray(orderBy)?orderBy:[orderBy]){const [k,d]=Object.entries(order)[0];if(a[k]<b[k])return d==='desc'?1:-1;if(a[k]>b[k])return d==='desc'?-1:1}return 0});return found.slice(0,take)},count:async({where}:any)=>get().filter(r=>matches(r,where)).length,create:async({data}:any)=>{if(get().some(r=>r.id===data.id))throw Object.assign(Error(),{code:'P2002'});const row={...data,sentAt:clock??new Date(),readAt:null,origin:'native'};get().push(row);return row},updateMany:async({where,data}:any)=>{const found=get().filter(r=>matches(r,where));found.forEach(r=>Object.assign(r,data));return {count:found.length}}}}
const urgentReport={findUnique:async({where}:any)=>reports.find(r=>r.id===where.id)??null,create:async({data}:any)=>{if(reports.some(r=>r.id===data.id))throw Object.assign(Error(),{code:'P2002'});const row={id:data.id,patientId:data.patientId,clinicianId:data.clinicianId,category:data.category,description:data.description,status:'open',createdAt:new Date(),acknowledgedAt:null,resolvedAt:null,resolutionNote:null};reports.push(row);return row}};
const db:any={assignedMessage:model(()=>rows),urgentReport,skinPhoto:model(()=>[]),careRoutineRevision:model(()=>[]),user:model(()=>[{id:A,name:'A',dermatologistId:assigned}]),dermatologist:model(()=>[{id:C,name:'C'},{id:D,name:'D'}]),$queryRaw:async()=>[{id:A}],$transaction:async(fn:any)=>{const prior=queue;let release!:()=>void;queue=new Promise(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}}};return original.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/messages',require('../src/routes/assigned-messages').default);
app.use('/urgent',require('../src/routes/urgent-reports').default);
app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=original;
// Same module cache as the routes above, so this reuses the mocked prisma; used for scenarios that
// need a clock the HTTP layer cannot inject (replies, week-boundary crossings).
const assignedMessages=require('../src/services/assignedMessages');
const identity=(id:string)=>({id,userType:[C,D].includes(id)?'dermatologist':'patient'});
let server:any,base:string;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`});after(()=>new Promise<void>(r=>server.close(r)));beforeEach(()=>{rows=[];reports=[];assigned=C});
const pair=`/messages/patients/${A}/clinicians/${C}`;
async function call(path:string,who=A,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':who,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const send=(id=randomUUID(),who=A,content='Synthetic text')=>call(pair+'/messages/'+id,who,'PUT',{content,reference:null});
// Direct service call (bypasses HTTP, which cannot inject a `now`) with the simulated clock pinned so
// the created row's sentAt matches the instant the limit check reasons about.
async function sendAt(who:string,pairArg:{patientId:string,clinicianId:string},content:string,now:Date){clock=now;try{return await assignedMessages.send(identity(who),pairArg,randomUUID(),{content,reference:null},now)}finally{clock=null}}

test('a patient\'s first message is allowed',async()=>{
 const r=await send();
 assert.equal(r.status,201);
 assert.equal(rows.length,1);
});

test('a second patient message within 7 days is refused with 429 and no message content',async()=>{
 const first=await send();
 assert.equal(first.status,201);
 const second=await send();
 assert.equal(second.status,429);
 assert.equal(second.body.code,'PATIENT_MESSAGE_LIMIT');
 const expected=new Date(rows[0].sentAt.getTime()+WEEK).toISOString();
 assert.equal(second.body.nextAllowedAt,expected);
 assert.deepEqual(Object.keys(second.body).sort(),['code','error','nextAllowedAt']);
 assert.equal(rows.length,1);
});

test('a clinician is never limited',async()=>{
 assert.equal((await send()).status,201);
 for(let i=0;i<3;i++)assert.equal((await call(pair+'/messages/'+randomUUID(),C,'PUT',{content:'Reply '+i,reference:null})).status,201);
 assert.equal(rows.length,4);
});

test('an urgent report still works while patient messages are blocked',async()=>{
 assert.equal((await send()).status,201);
 assert.equal((await send()).status,429);
 const report=await call('/urgent/'+randomUUID(),A,'PUT',{category:'reaction_to_treatment',description:'Synthetic swelling after new cream'});
 assert.equal(report.status,201);
 assert.equal(report.body.report.status,'open');
 assert.equal(reports.length,1);
});

test('a reply within 7 days of the clinician\'s last message is allowed even inside the patient\'s own weekly window',async()=>{
 const pairArg={patientId:A,clinicianId:C};
 const t0=new Date('2026-01-01T00:00:00.000Z');
 const first=await sendAt(A,pairArg,'Hi',t0);
 assert.equal(first.created,true);
 await assert.rejects(
  sendAt(A,pairArg,'Still me',new Date(t0.getTime()+2*86_400_000)),
  (e:any)=>e.statusCode===429&&e.code==='PATIENT_MESSAGE_LIMIT'
 );
 const t1=new Date(t0.getTime()+3*86_400_000);
 const reply=await sendAt(C,pairArg,'Reply',t1);
 assert.equal(reply.created,true);
 // 4 days after the patient's own last message (still inside their weekly window) but only 1 day
 // after the clinician's reply: only the reply exception can be letting this through.
 const t2=new Date(t0.getTime()+4*86_400_000);
 const replyToReply=await sendAt(A,pairArg,'Thanks',t2);
 assert.equal(replyToReply.created,true);
});

test('the weekly window reopens 7 days after the patient\'s last message',async()=>{
 const pairArg={patientId:A,clinicianId:C};
 const t0=new Date('2026-02-01T00:00:00.000Z');
 await sendAt(A,pairArg,'Hi',t0);
 await assert.rejects(
  sendAt(A,pairArg,'Too soon',new Date(t0.getTime()+WEEK-1000)),
  (e:any)=>e.statusCode===429
 );
 const reopened=await sendAt(A,pairArg,'New week',new Date(t0.getTime()+WEEK+1000));
 assert.equal(reopened.created,true);
});

test('current() exposes the remaining allowance for the client to show before typing',async()=>{
 const pairArg={patientId:A,clinicianId:C};
 const t0=new Date('2026-03-01T00:00:00.000Z');
 assert.deepEqual((await assignedMessages.current(identity(A),t0)).conversation.limit,{canSend:true,nextAllowedAt:null,reason:'weekly'});
 await sendAt(A,pairArg,'Hi',t0);
 const t1=new Date(t0.getTime()+86_400_000);
 const blocked=(await assignedMessages.current(identity(A),t1)).conversation.limit;
 assert.equal(blocked.canSend,false);
 assert.equal(blocked.reason,'weekly');
 assert.equal(blocked.nextAllowedAt,new Date(t0.getTime()+WEEK).toISOString());
 await sendAt(C,pairArg,'Reply',t1);
 const t2=new Date(t1.getTime()+86_400_000);
 assert.deepEqual((await assignedMessages.current(identity(A),t2)).conversation.limit,{canSend:true,nextAllowedAt:null,reason:'reply-window'});
});
