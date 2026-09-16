import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';
process.env.SUPABASE_URL='https://urgent-reports-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
const A=randomUUID(),B=randomUUID(),C=randomUUID(),D=randomUUID(),E=randomUUID();
let reports:any[]=[],assignedA=C,afterLock:(()=>void)|undefined,queue=Promise.resolve(),seq=0;
const users=()=>[{id:A,name:'Patient A',dermatologistId:assignedA},{id:B,name:'Patient B',dermatologistId:D},{id:E,name:'Unassigned',dermatologistId:null}];
function matchesWhere(row:any,where:any):boolean{
 if(!where)return true;
 return Object.entries(where).every(([k,v]:[string,any])=>{
  if(k==='patient'){const u=users().find(x=>x.id===row.patientId);return matchesWhere(u,v)}
  if(v&&typeof v==='object'&&!(v instanceof Date)){
   if('not' in v)return row[k]!==v.not;
   return matchesWhere(row[k],v);
  }
  return row[k]===v;
 });
}
function sortRows(rows:any[],orderBy:any[]):any[]{
 return rows.slice().sort((a,b)=>{
  for(const ob of orderBy){
   const [key,dir]=Object.entries(ob)[0] as [string,'asc'|'desc'];
   let av=a[key],bv=b[key];
   if(av instanceof Date)av=av.getTime();
   if(bv instanceof Date)bv=bv.getTime();
   if(av<bv)return dir==='asc'?-1:1;
   if(av>bv)return dir==='asc'?1:-1;
  }
  return 0;
 });
}
const withPatient=(row:any)=>row?{...row,patient:{name:users().find(u=>u.id===row.patientId)?.name??null}}:row;
const urgentReport={
 findUnique:async({where,select,include}:any)=>{
  const row=reports.find(r=>r.id===where.id)??null;
  if(!row)return null;
  if(select)return Object.fromEntries(Object.keys(select).map(k=>[k,row[k]]));
  return include?.patient?withPatient(row):row;
 },
 findFirst:async({where,orderBy,include}:any)=>{
  let found=reports.filter(r=>matchesWhere(r,where));
  if(orderBy)found=sortRows(found,orderBy);
  const row=found[0]??null;
  return include?.patient?withPatient(row):row;
 },
 count:async({where}:any)=>reports.filter(r=>matchesWhere(r,where)).length,
 findMany:async({where,orderBy,include,skip=0,take}:any)=>{
  let found=reports.filter(r=>matchesWhere(r,where));
  if(orderBy)found=sortRows(found,orderBy);
  found=found.slice(skip,take!==undefined?skip+take:undefined);
  return include?.patient?found.map(withPatient):found;
 },
 create:async({data}:any)=>{
  if(reports.some(r=>r.id===data.id))throw Object.assign(new Error('unique'),{code:'P2002'});
  const row={id:data.id,patientId:data.patientId,clinicianId:data.clinicianId,category:data.category,description:data.description,status:'open',createdAt:new Date(Date.now()+seq++),acknowledgedAt:null,acknowledgedBy:null,resolvedAt:null,resolvedBy:null,resolutionNote:null};
  reports.push(row);
  return row;
 },
 update:async({where,data}:any)=>{
  const row=reports.find(r=>r.id===where.id);
  const patch:any={...data};
  if(patch.acknowledger){patch.acknowledgedBy=patch.acknowledger.connect.id;delete patch.acknowledger}
  if(patch.resolver){patch.resolvedBy=patch.resolver.connect.id;delete patch.resolver}
  return Object.assign(row,patch);
 }
};
const db:any={urgentReport,
 user:{findUnique:async({where}:any)=>{const u=users().find(x=>x.id===where.id);return u?{id:u.id,dermatologistId:u.dermatologistId}:null}},
 $queryRaw:async()=>{afterLock?.();afterLock=undefined;return[]},
 $transaction:async(fn:any,_opts?:any)=>{const prior=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{TransactionIsolationLevel:{RepeatableRead:'RepeatableRead'}}};return original.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/urgent',require('../src/routes/urgent-reports').default);app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=original;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/urgent`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{reports=[];assignedA=C;afterLock=undefined;delete process.env.ENROLLMENT_ENFORCEMENT});
async function call(path:string,who:string=A,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':who,'content-type':'application/json'},body:body===undefined||method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const report=(id=randomUUID(),body:any={category:'reaction_to_treatment',description:'Synthetic swelling after new cream'},who=A)=>call('/'+id,who,'PUT',body);
test('roles are enforced',async()=>{
 assert.equal((await report(randomUUID(),undefined,C)).status,403);
 assert.equal((await call('/queue',A)).status,403);
 assert.equal((await call(`/${randomUUID()}/acknowledge`,A,'POST',{})).status,403);
});
test('patient report is created for the assigned clinician and replays exactly',async()=>{
 const id=randomUUID(),first=await report(id);
 assert.equal(first.status,201);assert.equal(first.body.report.status,'open');
 assert.equal((await report(id)).status,200);
 assert.equal((await report(id,{category:'other',description:'Changed'})).status,409);
 const foreign=await report(id,undefined,B);assert.equal(foreign.status,404);assert.equal(foreign.body.report,undefined);
 assert.equal(reports[0].clinicianId,C);
});
test('unassigned patient gets a clear conflict, never a silent drop',async()=>{
 const r=await report(randomUUID(),undefined,E);assert.equal(r.status,409);assert.equal(r.body.code,'NO_ASSIGNED_CLINICIAN');
});
test('queue shows only current assignments, open before acknowledged, oldest first',async()=>{
 const older=randomUUID(),newer=randomUUID(),acked=randomUUID(),resolved=randomUUID();
 await report(older);await report(newer);await report(acked);await report(resolved);
 await call(`/${acked}/acknowledge`,C,'POST',{});await call(`/${resolved}/resolve`,C,'POST',{resolutionNote:null});
 await report(randomUUID(),undefined,B);
 const q=await call('/queue',C);
 assert.deepEqual(q.body.data.map((r:any)=>r.id),[older,newer,acked]);assert.equal(q.body.openCount,2);assert.equal(q.body.data[0].patientName,'Patient A');
 assignedA=D;
 assert.equal((await call('/queue',C)).body.data.length,0);
 assert.equal((await call('/queue',D)).body.pagination.total,4);
});
test('acknowledge and resolve are idempotent, forward-only and assignment-checked',async()=>{
 const id=randomUUID();await report(id);
 assert.equal((await call(`/${id}/acknowledge`,D,'POST',{})).status,404);
 const a1=await call(`/${id}/acknowledge`,C,'POST',{}),a2=await call(`/${id}/acknowledge`,C,'POST',{});
 assert.equal(a1.body.report.status,'acknowledged');assert.equal(a2.body.report.acknowledgedAt,a1.body.report.acknowledgedAt);
 const r1=await call(`/${id}/resolve`,C,'POST',{resolutionNote:'Please stop the cream and book an in-person visit.'});
 assert.equal(r1.body.report.status,'resolved');
 assert.equal((await call(`/${id}/resolve`,C,'POST',{resolutionNote:'Please stop the cream and book an in-person visit.'})).status,200);
 assert.equal((await call(`/${id}/resolve`,C,'POST',{resolutionNote:'Different'})).status,409);
 assert.equal((await call(`/${id}/acknowledge`,C,'POST',{})).body.report.status,'resolved');
 const open=randomUUID();await report(open);
 const direct=await call(`/${open}/resolve`,C,'POST',{resolutionNote:null});
 assert.ok(direct.body.report.acknowledgedAt);assert.ok(direct.body.report.resolvedAt);
 const mine=await call('/',A);assert.equal(mine.body.data.find((r:any)=>r.id===id).resolutionNote,'Please stop the cream and book an in-person visit.');
 afterLock=()=>{assignedA=D};assert.equal((await call(`/${open}/acknowledge`,C,'POST',{})).status,404);
});
test('an unassigned clinician cannot resolve a report',async()=>{
 const id=randomUUID();await report(id);
 const r=await call(`/${id}/resolve`,D,'POST',{resolutionNote:null});
 assert.equal(r.status,404);assert.equal(r.body.report,undefined);
 assert.equal(reports[0].status,'open');
});
test('patient history requires assignment; reads are paginated',async()=>{
 await report();assert.equal((await call(`/patients/${A}`,C)).body.pagination.total,1);
 assert.equal((await call(`/patients/${A}`,D)).status,404);
 assert.equal((await call('/?limit=51',A)).status,400);
});
test('strict validation',async()=>{
 for(const body of [{category:'emergency',description:'x'},{category:'other',description:'   '},{category:'other',description:'x'.repeat(2001)},{category:'other',description:'x',severity:'high'}])assert.equal((await report(randomUUID(),body)).status,400);
 assert.equal((await call(`/${randomUUID()}/resolve`,C,'POST',{resolutionNote:'x'.repeat(2001)})).status,400);
});
test('urgent reports are never enrollment-gated',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';assert.equal((await report()).status,201);
});
