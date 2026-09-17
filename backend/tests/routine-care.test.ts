import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import { randomUUID } from 'node:crypto';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333', D='44444444-4444-4444-8444-444444444444';
process.env.SUPABASE_URL='https://routine-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
process.env.ENROLLMENT_ENFORCEMENT='off'; // The gate itself is covered by enrollment-gate.test.ts.
let revisions:any[]=[],completions:any[]=[],legacyWrites=0,assigned=C,queue=Promise.resolve(),afterLock:(()=>void)|undefined;
const matches=(r:any,w:any):boolean=>Object.entries(w||{}).every(([k,v]:any)=>typeof v==='object'&&v!==null?matches(r,v):r[k]===v);
function model(rows:()=>any[]){return {
 findUnique:async({where}:any)=>rows().find(r=>matches(r,where))??null,
 findFirst:async(args:any)=>(await model(rows).findMany(args))[0]??null,
 findMany:async({where,orderBy,skip=0,take,include}:any={})=>{let found=rows().filter(r=>matches(r,where));for(const order of [...(Array.isArray(orderBy)?orderBy:orderBy?[orderBy]:[])].reverse()){const [key,dir]=Object.entries(order)[0];found.sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(dir==='desc'?-1:1))}return found.slice(skip,take===undefined?undefined:skip+take).map(r=>include?.routine?{...r,routine:revisions.find(v=>v.id===r.revisionId)}:r)},
 count:async({where}:any)=>rows().filter(r=>matches(r,where)).length,
 create:async({data}:any)=>{if(rows().some(r=>r.id===data.id||(data.revisionId&&r.userId===data.userId&&r.revisionId===data.revisionId&&r.localDate===data.localDate)))throw Object.assign(new Error('unique'),{code:'P2002'});const row={...data,...(data.revisionId?{receivedAt:new Date()}:{createdAt:new Date()})};rows().push(row);return row}
}}
const legacy={create:async()=>{legacyWrites++;return{}},update:async()=>{legacyWrites++;return{}},delete:async()=>{legacyWrites++;return{}},updateMany:async()=>{legacyWrites++;return{}},findMany:async()=>[],findUnique:async()=>null};
const db:any={careRoutineRevision:model(()=>revisions),careRoutineCompletion:model(()=>completions),routine:legacy,routineStep:legacy,user:{findUnique:async({where}:any)=>where.id===A?{id:A,dermatologistId:assigned}:where.id===B?{id:B,dermatologistId:D}:null},$queryRaw:async()=>{afterLock?.();afterLock=undefined;return[{id:A}]},$transaction:async(fn:any)=>{const prior=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const originalLoad=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return{PrismaClient:class{constructor(){return db}}};return originalLoad.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});app.use('/routines',require('../src/routes/routines').default);app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=originalLoad;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/routines`});after(()=>new Promise<void>(r=>server.close(r)));beforeEach(()=>{revisions=[];completions=[];legacyWrites=0;assigned=C;afterLock=undefined});
async function call(path:string,identity=A,method='GET',body?:any){const response=await fetch(base+path,{method,headers:{'x-identity':identity,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json().catch(()=>({})) as any}}
const definition=(expectedRevisionId:string|null=null)=>({expectedRevisionId,name:'Original synthetic routine',isActive:true,steps:[{title:'Synthetic step',instructions:'Synthetic instructions'}]});
const edit=(id=randomUUID(),body=definition(),identity=C,patient=A,slot='morning')=>call(`/patients/${patient}/${slot}/revisions/${id}`,identity,'PUT',body);
const event=(revisionId:string)=>({revisionId,completedAt:'2026-01-01T06:30:00.000Z',localDate:'2026-01-01',timeZone:'Asia/Kolkata'});
const complete=(body:any,id=randomUUID(),identity=A)=>call(`/completions/${id}`,identity,'PUT',body);
test('patient definition writes forbidden without legacy mutation',async()=>{for(const[method,path]of[['POST','/'],['PATCH','/'+randomUUID()],['DELETE','/'+randomUUID()]])assert.equal((await call(path,A,method,definition())).status,403);assert.equal(legacyWrites,0);assert.equal((await edit(randomUUID(),definition(),A)).status,403)});
test('obsolete single read, step and reset are gone without mutation',async()=>{for(const[method,path]of[['GET','/'+randomUUID()],['POST','/reset-daily'],['POST',`/${randomUUID()}/steps/${randomUUID()}/complete`]])assert.equal((await call(path,A,method)).status,410);assert.equal(legacyWrites,0)});
test('assignment concealed and authorization checked after patient lock',async()=>{assert.equal((await edit(randomUUID(),definition(),D)).status,404);afterLock=()=>{assigned=D};assert.equal((await edit()).status,404);assert.equal(revisions.length,0)});
test('immutable edits retain original completion history and latest snapshot',async()=>{const first=await edit();assert.equal(first.status,201);const id=first.body.routine.id;assert.equal((await complete(event(id))).status,201);const second=await edit(randomUUID(),{...definition(id),name:'Edited synthetic routine'});assert.equal(second.status,201);assert.equal(second.body.routine.version,2);const snapshot=await call('/?localDate=2026-01-01');assert.equal(snapshot.body.routines.length,1);assert.equal(snapshot.body.routines[0].name,'Edited synthetic routine');assert.equal(snapshot.body.completions[0].revisionId,id);const history=await call(`/patients/${A}/completions`,C);assert.equal(history.body.data[0].routine.name,'Original synthetic routine');assert.equal(history.body.pagination.total,1)});
test('revision retry survives newer edit and rejects identity content conflict',async()=>{const id=randomUUID();assert.equal((await edit(id)).status,201);assert.equal((await edit(randomUUID(),definition(id))).status,201);assert.equal((await edit(id)).status,200);assert.equal((await edit(id,{...definition(),name:'changed'})).status,409);assert.equal((await edit(id,definition(),C,A,'evening')).status,409);assert.equal((await edit(randomUUID(),definition())).status,409);assert.equal(revisions.length,2);assigned=D;assert.equal((await edit(id)).status,404)});
test('concurrent editors cannot overwrite expected revision',async()=>{const results=await Promise.all([edit(),edit()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(revisions.length,1)});
test('completion owner and role checked before writes',async()=>{const row=await edit();assert.equal(row.status,201);assert.equal((await complete(event(row.body.routine.id),randomUUID(),B)).status,404);assert.equal((await complete(event(row.body.routine.id),randomUUID(),C)).status,403);assert.equal(completions.length,0)});
test('completion retries and daily duplicates return canonical immutable event',async()=>{const row=await edit();assert.equal(row.status,201);const body=event(row.body.routine.id),id=randomUUID();const first=await complete(body,id);assert.equal(first.status,201);assert.deepEqual((await complete(body,id)).body,first.body);const duplicate=await complete({...body,completedAt:'2026-01-01T07:00:00.000Z'});assert.equal(duplicate.status,200);assert.deepEqual(duplicate.body,first.body);assert.equal((await complete({...body,timeZone:'UTC'},id)).status,409);assert.equal(completions.length,1)});
test('concurrent daily reports return one canonical ID',async()=>{const row=await edit();assert.equal(row.status,201);const results=await Promise.all([complete(event(row.body.routine.id)),complete(event(row.body.routine.id))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].body.completion.id,results[1].body.completion.id);assert.equal(completions.length,1)});
test('old active revisions reportable but archived revisions cannot complete',async()=>{const first=await edit();assert.equal(first.status,201);const archived=await edit(randomUUID(),{...definition(first.body.routine.id),isActive:false,steps:[]});assert.equal(archived.status,201);assert.equal((await complete(event(first.body.routine.id))).status,201);assert.equal((await complete(event(archived.body.routine.id))).status,400)});
test('strict date timezone skew and body bounds reject invalid input',async()=>{const first=await edit();assert.equal(first.status,201);const body=event(first.body.routine.id);for(const patch of[{completedAt:'2026-02-30T06:30:00Z'},{completedAt:'not a date'},{completedAt:'2026-01-01T06:30:00+24:00'},{completedAt:new Date(Date.now()+600000).toISOString()},{localDate:'2026-02-30'},{localDate:'2025-12-31'},{timeZone:'invented/zone'},{timeZone:'+05:30'},{userId:B}])assert.equal((await complete({...body,...patch})).status,400,JSON.stringify(patch));assert.equal((await edit('invalid')).status,400);for(const patch of[{name:' '},{name:'x'.repeat(121)},{steps:[]},{steps:Array(21).fill({title:'x',instructions:''})},{steps:[{title:'x',instructions:'x'.repeat(2001)}]},{createdBy:D}])assert.equal((await edit(randomUUID(),{...definition(),...patch})).status,400);assert.equal(completions.length,0)});
test('snapshot history enforce assignment date and bounded pagination',async()=>{assert.equal((await call(`/patients/${A}`,D)).status,404);assert.equal((await call(`/patients/${A}/completions`,D)).status,404);for(const query of['limit=0','limit=51','page=0','limit=2.5','page=Infinity'])assert.equal((await call(`/patients/${A}/completions?${query}`,C)).status,400);assert.equal((await call('/?localDate=2026-02-30')).status,400);assert.equal((await call(`/patients/${A}?localDate=2026-01-01`,C)).status,200)});
test('revision retries compare step content independent of JSON object key order',async()=>{const id=randomUUID();assert.equal((await edit(id)).status,201);revisions[0].steps=[{instructions:'Synthetic instructions',title:'Synthetic step'}];assert.equal((await edit(id)).status,200)});
test('history ties use descending IDs and stable pagination',async()=>{
 const revision=await edit();assert.equal(revision.status,201);
 const low='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',high='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 assert.equal((await complete(event(revision.body.routine.id),low)).status,201);
 assert.equal((await complete({...event(revision.body.routine.id),completedAt:'2026-01-02T06:30:00Z',localDate:'2026-01-02'},high)).status,201);
 completions.forEach(row=>row.receivedAt=new Date('2026-01-03T00:00:00Z'));
 const first=await call(`/patients/${A}/completions?page=1&limit=1`,C),second=await call(`/patients/${A}/completions?page=2&limit=1`,C);
 assert.equal(first.body.data[0].id,high);assert.equal(second.body.data[0].id,low);assert.deepEqual(first.body.pagination,{page:1,limit:1,total:2,totalPages:2});
});
test('completion identity cannot be reused against another owned revision even on a completed day',async()=>{
 const one=await edit(),two=await edit(randomUUID(),definition(),C,A,'evening');assert.equal(one.status,201);assert.equal(two.status,201);
 const original=randomUUID();assert.equal((await complete(event(one.body.routine.id),original)).status,201);assert.equal((await complete(event(two.body.routine.id))).status,201);
 assert.equal((await complete(event(two.body.routine.id),original)).status,409);assert.equal(completions.length,2);
});
test('another patient cannot reuse a completion ID even with their own revision',async()=>{
 const one=await edit(),two=await edit(randomUUID(),definition(),D,B);assert.equal(one.status,201);assert.equal(two.status,201);
 const id=randomUUID();assert.equal((await complete(event(one.body.routine.id),id)).status,201);
 assert.equal((await complete(event(two.body.routine.id),id,B)).status,404);assert.equal(completions.length,1);
});
test('revision history lists one slot newest first with bounded pagination for the assigned clinician',async()=>{
 const one=await edit();assert.equal(one.status,201);
 const two=await edit(randomUUID(),{...definition(one.body.routine.id),name:'Second synthetic routine'});assert.equal(two.status,201);
 assert.equal((await edit(randomUUID(),definition(),C,A,'evening')).status,201);
 const first=await call(`/patients/${A}/revisions?timeOfDay=morning&limit=1`,C);
 assert.equal(first.status,200);
 assert.deepEqual(first.body.data.map((r:any)=>[r.version,r.name,r.timeOfDay]),[[2,'Second synthetic routine','morning']]);
 assert.deepEqual(first.body.data[0].steps,[{title:'Synthetic step',instructions:'Synthetic instructions'}]);
 assert.deepEqual(first.body.pagination,{page:1,limit:1,total:2,totalPages:2});
 const second=await call(`/patients/${A}/revisions?timeOfDay=morning&page=2&limit=1`,C);
 assert.deepEqual(second.body.data.map((r:any)=>r.version),[1]);
 const evenings=await call(`/patients/${A}/revisions?timeOfDay=evening`,C);
 assert.deepEqual(evenings.body.data.map((r:any)=>r.timeOfDay),['evening']);
 assert.equal(evenings.body.pagination.limit,20);
});
test('revision history rejects patients, unassigned clinicians and invalid queries without writes',async()=>{
 assert.equal((await edit()).status,201);
 assert.equal((await call(`/patients/${A}/revisions?timeOfDay=morning`,A)).status,403);
 assert.equal((await call(`/patients/${A}/revisions?timeOfDay=morning`,D)).status,404);
 afterLock=()=>{assigned=D};assert.equal((await call(`/patients/${A}/revisions?timeOfDay=morning`,C)).status,404);assigned=C;
 for(const query of['','timeOfDay=noon','timeOfDay=morning&limit=51','timeOfDay=morning&page=0','timeOfDay=morning&limit=2.5','timeOfDay=morning&sort=version'])assert.equal((await call(`/patients/${A}/revisions?${query}`,C)).status,400,query);
 assert.equal((await call('/patients/not-a-uuid/revisions?timeOfDay=morning',C)).status,400);
 assert.equal(revisions.length,1);
});
