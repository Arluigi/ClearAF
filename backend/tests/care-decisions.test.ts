import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';
process.env.SUPABASE_URL='https://care-decisions-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
const A=randomUUID(),B=randomUUID(),C=randomUUID(),D=randomUUID();
let decisions:any[]=[],photos:any[]=[],assigned=C,afterLock:(()=>void)|undefined,queue=Promise.resolve(),seq=0;
const matches=(r:any,w:any={}):boolean=>Object.entries(w).every(([k,v]:any)=>v&&typeof v==='object'&&!(v instanceof Date)?matches(r,v):r[k]===v);
const withClinician=(row:any)=>row?{...row,clinician:{name:row.clinicianId===C?'Clinician C':'Clinician D'}}:row;
const sortDesc=(rows:any[])=>rows.slice().sort((a,b)=>(b.createdAt as Date).getTime()-(a.createdAt as Date).getTime()||(a.id<b.id?1:-1));
const careDecision={
 findUnique:async({where,include}:any)=>{const row=decisions.find(r=>r.id===where.id)??null;return include?.clinician?withClinician(row):row},
 findFirst:async({where,orderBy,include}:any)=>{let found=decisions.filter(r=>matches(r,where));if(orderBy)found=sortDesc(found);const row=found[0]??null;return include?.clinician?withClinician(row):row},
 findMany:async({where,orderBy,include,skip=0,take}:any)=>{let found=decisions.filter(r=>matches(r,where));if(orderBy)found=sortDesc(found);found=found.slice(skip,take!==undefined?skip+take:undefined);return include?.clinician?found.map(withClinician):found},
 count:async({where}:any)=>decisions.filter(r=>matches(r,where)).length,
 create:async({data,include}:any)=>{if(decisions.some(r=>r.id===data.id))throw Object.assign(new Error('unique'),{code:'P2002'});const row={...data,refundUpdatedAt:null,createdAt:new Date(Date.now()+seq++)};decisions.push(row);return include?.clinician?withClinician(row):row},
 update:async({where,data,include}:any)=>{const row=Object.assign(decisions.find(r=>r.id===where.id),data);return include?.clinician?withClinician(row):row}
};
const skinPhoto={findFirst:async({where}:any)=>photos.find(p=>matches(p,where))??null};
const db:any={careDecision,skinPhoto,
 user:{findUnique:async({where}:any)=>where.id===A?{id:A,dermatologistId:assigned}:where.id===B?{id:B,dermatologistId:D}:null},
 $queryRaw:async()=>{afterLock?.();afterLock=undefined;return[]},
 $transaction:async(fn:any)=>{const prior=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{}};return original.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/decisions',require('../src/routes/care-decisions').default);app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=original;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/decisions`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{decisions=[];photos=[];assigned=C;afterLock=undefined});
async function call(path:string,who:string=A,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':who,'content-type':'application/json'},body:body===undefined||method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const record=(id=randomUUID(),body:any={decision:'refer_out',patientMessage:'Please see an in-person dermatologist.',photoId:null},who=C,patient=A)=>call(`/patients/${patient}/decisions/${id}`,who,'PUT',body);
test('roles are enforced',async()=>{
 assert.equal((await call('/current',C)).status,403);
 assert.equal((await call(`/patients/${A}`,A)).status,403);
 assert.equal((await record(randomUUID(),undefined,A)).status,403);
});
test('refer out starts a pending refund, replays exactly and is visible only to that patient',async()=>{
 const id=randomUUID(),first=await record(id);
 assert.equal(first.status,201);assert.equal(first.body.decision.refundStatus,'pending');assert.equal(first.body.decision.clinicianName,'Clinician C');
 assert.equal((await record(id)).status,200);
 assert.equal((await record(id,{decision:'needs_in_person',patientMessage:null,photoId:null})).status,409);
 assert.equal((await call('/current',A)).body.decision.id,id);
 assert.equal((await call('/current',B)).body.decision,null);
});
test('linked photo must belong to the patient',async()=>{
 const own=randomUUID(),other=randomUUID();photos.push({id:own,userId:A},{id:other,userId:B});
 assert.equal((await record(randomUUID(),{decision:'needs_in_person',patientMessage:null,photoId:own})).status,201);
 assert.equal((await record(randomUUID(),{decision:'needs_in_person',patientMessage:null,photoId:other})).status,404);
 assert.equal((await record(randomUUID(),{decision:'needs_in_person',patientMessage:null,photoId:randomUUID()})).status,404);
});
test('assignment is required and rechecked after the lock',async()=>{
 assert.equal((await record(randomUUID(),undefined,D)).status,404);
 assert.equal((await call(`/patients/${A}`,D)).status,404);
 afterLock=()=>{assigned=D};assert.equal((await record()).status,404);assert.equal(decisions.length,0);
});
test('refund moves pending to issued once; async care has no refund',async()=>{
 const id=randomUUID();await record(id);
 const issued=await call(`/patients/${A}/decisions/${id}/refund`,C,'PUT',{refundStatus:'issued'});
 assert.equal(issued.status,200);assert.equal(issued.body.decision.refundStatus,'issued');assert.ok(issued.body.decision.refundUpdatedAt);
 const again=await call(`/patients/${A}/decisions/${id}/refund`,C,'PUT',{refundStatus:'issued'});
 assert.equal(again.body.decision.refundUpdatedAt,issued.body.decision.refundUpdatedAt);
 const resume=randomUUID();const r=await record(resume,{decision:'async_care',patientMessage:null,photoId:null});
 assert.equal(r.body.decision.refundStatus,'not_applicable');
 assert.equal((await call(`/patients/${A}/decisions/${resume}/refund`,C,'PUT',{refundStatus:'issued'})).status,409);
 assert.equal((await call('/current',A)).body.decision.decision,'async_care');
 assert.equal((await call(`/patients/${A}/decisions/${randomUUID()}/refund`,C,'PUT',{refundStatus:'issued'})).status,404);
});
test('history is paginated newest first',async()=>{
 const ids=[randomUUID(),randomUUID(),randomUUID()];for(const id of ids)await record(id);
 const page=await call(`/patients/${A}?page=1&limit=2`,C);
 assert.deepEqual(page.body.data.map((d:any)=>d.id),[ids[2],ids[1]]);assert.deepEqual(page.body.pagination,{page:1,limit:2,total:3,totalPages:2});
});
test('strict validation',async()=>{
 for(const body of [{decision:'discharge',patientMessage:null,photoId:null},{decision:'refer_out',patientMessage:'x'.repeat(2001),photoId:null},{decision:'refer_out',patientMessage:'  ',photoId:null},{decision:'refer_out',patientMessage:null,photoId:null,refundStatus:'issued'}])assert.equal((await record(randomUUID(),body)).status,400);
 assert.equal((await call(`/patients/${A}?limit=51`,C)).status,400);
 assert.equal((await call(`/patients/${A}/decisions/${randomUUID()}/refund`,C,'PUT',{refundStatus:'pending'})).status,400);
});
