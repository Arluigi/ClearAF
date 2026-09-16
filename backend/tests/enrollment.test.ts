import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';
process.env.SUPABASE_URL='https://enrollment-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
process.env.LICENSED_STATES='IL,NY';process.env.MINIMUM_PATIENT_AGE='18';
const A=randomUUID(),B=randomUUID(),C=randomUUID(),D=randomUUID();
let screenings:any[]=[],acceptances:any[]=[],assigned=C,afterLock:(()=>void)|undefined,queue=Promise.resolve(),seq=0;
const matches=(r:any,w:any={}):boolean=>Object.entries(w).every(([k,v]:any)=>v&&typeof v==='object'&&!(v instanceof Date)?matches(r,v):r[k]===v);
function model(rows:()=>any[],unique:(a:any,b:any)=>boolean){return {
 findUnique:async({where}:any)=>rows().find(r=>matches(r,where))??null,
 findFirst:async({where,orderBy}:any)=>{const found=rows().filter(r=>matches(r,where));if(orderBy)found.sort((a,b)=>b.submittedAt-a.submittedAt||(a.id<b.id?1:-1));return found[0]??null},
 count:async({where}:any)=>rows().filter(r=>matches(r,where)).length,
 create:async({data}:any)=>{if(rows().some(r=>r.id===data.id||unique(r,data)))throw Object.assign(new Error('unique'),{code:'P2002'});const row={id:randomUUID(),...data,submittedAt:new Date(Date.now()+seq++),acceptedAt:new Date(),waitlistRequestedAt:null};rows().push(row);return row},
 update:async({where,data}:any)=>Object.assign(rows().find(r=>matches(r,where)),data)
}}
const db:any={eligibilityScreening:model(()=>screenings,()=>false),consentAcceptance:model(()=>acceptances,(a,b)=>a.userId===b.userId&&a.documentVersion===b.documentVersion),
 user:{findUnique:async({where}:any)=>where.id===A?{id:A,dermatologistId:assigned}:where.id===B?{id:B,dermatologistId:D}:null},
 $queryRaw:async()=>{afterLock?.();afterLock=undefined;return[]},
 $transaction:async(fn:any)=>{const prior=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{}};return original.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/enrollment',require('../src/routes/enrollment').default);app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=original;
const {currentConsent}=require('../src/content/consent');
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/enrollment`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{screenings=[];acceptances=[];assigned=C;afterLock=undefined});
async function call(path:string,who:string=A,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':who,'content-type':'application/json'},body:body===undefined||method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const answers=(patch:any={})=>({stateCode:'IL',dateOfBirth:'1995-04-02',pregnancyStatus:'none',...patch});
const screen=(id=randomUUID(),body=answers(),who=A)=>call('/screenings/'+id,who,'PUT',body);
const consent=()=>currentConsent();
test('roles are enforced on every endpoint',async()=>{
 for(const [path,method] of [['/','GET'],['/screenings/'+randomUUID(),'PUT'],['/waitlist','PUT'],['/consents/1','PUT']])assert.equal((await call(path,C,method,{})).status,403);
 assert.equal((await call('/patients/'+A,A)).status,403);
});
test('screening then consent reaches enrolled; replays are idempotent',async()=>{
 assert.equal((await call('/')).body.status,'screening_required');
 const id=randomUUID(),first=await screen(id);
 assert.equal(first.status,201);assert.equal(first.body.status,'consent_required');assert.equal(first.body.screening.dateOfBirth,'1995-04-02');
 assert.equal((await screen(id)).status,200);
 assert.equal((await screen(id,answers({stateCode:'NY'}))).status,409);
 assert.equal((await call('/consents/1',A,'PUT',{documentSha256:'0'.repeat(64)})).status,409);
 assert.equal((await call('/consents/2',A,'PUT',{documentSha256:consent().sha256})).status,409);
 const accepted=await call('/consents/1',A,'PUT',{documentSha256:consent().sha256});
 assert.equal(accepted.status,201);assert.equal(accepted.body.status,'enrolled');
 assert.equal((await call('/consents/1',A,'PUT',{documentSha256:consent().sha256})).status,200);
 const status=(await call('/')).body;assert.equal(status.status,'enrolled');assert.equal(status.consent.version,1);assert.ok(status.consent.acceptedAt);
});
test('ineligible screening explains reasons, supports waitlist once and blocks consent',async()=>{
 const id=randomUUID(),r=await screen(id,answers({stateCode:'TX',pregnancyStatus:'pregnant'}));
 assert.equal(r.body.status,'ineligible');assert.deepEqual(r.body.screening.reasons,['state','pregnancy']);
 assert.equal((await call('/consents/1',A,'PUT',{documentSha256:consent().sha256})).status,409);
 const w1=await call('/waitlist',A,'PUT',{screeningId:id}),w2=await call('/waitlist',A,'PUT',{screeningId:id});
 assert.equal(w1.status,200);assert.ok(w1.body.screening.waitlistRequestedAt);assert.equal(w2.body.screening.waitlistRequestedAt,w1.body.screening.waitlistRequestedAt);
 const later=randomUUID();await screen(later);assert.equal((await call('/waitlist',A,'PUT',{screeningId:later})).status,409);
 assert.equal((await call('/waitlist',A,'PUT',{screeningId:id})).status,404);
});
test('another patient cannot replay or waitlist a screening they do not own',async()=>{
 const id=randomUUID();await screen(id);
 assert.equal((await screen(id,answers(),B)).status,404);
 assert.equal((await call('/waitlist',B,'PUT',{screeningId:id})).status,404);
});
test('a patient may submit again after moving; the latest screening decides status',async()=>{
 const first=await screen(randomUUID(),answers({stateCode:'WA'}));
 assert.equal(first.body.status,'ineligible');
 const secondId=randomUUID(),second=await screen(secondId,answers({stateCode:'IL'}));
 assert.equal(second.status,201);assert.equal(second.body.status,'consent_required');assert.equal(second.body.screening.id,secondId);
 const status=await call('/');
 assert.equal(status.body.status,'consent_required');assert.equal(status.body.screening.id,secondId);
 const accepted=await call('/consents/1',A,'PUT',{documentSha256:consent().sha256});
 assert.equal(accepted.status,201);assert.equal(accepted.body.status,'enrolled');
});
test('strict validation rejects malformed answers before storage',async()=>{
 for(const body of [answers({stateCode:'ZZ'}),answers({dateOfBirth:'2026-02-30'}),answers({dateOfBirth:'2999-01-01'}),answers({pregnancyStatus:'unknown'}),{...answers(),eligible:true},answers({dateOfBirth:'1899-12-31'})])assert.equal((await screen(randomUUID(),body)).status,400);
 assert.equal((await screen('not-a-uuid')).status,400);
 assert.equal(screenings.length,0);
});
test('clinician summary requires current assignment checked after the lock',async()=>{
 await screen();
 const ok=await call('/patients/'+A,C);
 assert.equal(ok.status,200);assert.equal(ok.body.screeningCount,1);assert.equal(ok.body.consent.body,undefined);assert.equal(ok.body.status,'consent_required');
 assert.equal((await call('/patients/'+A,D)).status,404);
 afterLock=()=>{assigned=D};assert.equal((await call('/patients/'+A,C)).status,404);
});
