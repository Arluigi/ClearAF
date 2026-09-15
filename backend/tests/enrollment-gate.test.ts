import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';
process.env.SUPABASE_URL='https://enrollment-gate-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
process.env.LICENSED_STATES='IL,NY';process.env.MINIMUM_PATIENT_AGE='18';
const A=randomUUID(),C=randomUUID();
let screenings:any[]=[],acceptances:any[]=[],writes=0;
const matches=(r:any,w:any={}):boolean=>Object.entries(w).every(([k,v]:any)=>v&&typeof v==='object'&&!(v instanceof Date)?matches(r,v):r[k]===v);
function model(rows:()=>any[],unique:(a:any,b:any)=>boolean){return {
 findUnique:async({where}:any)=>rows().find(r=>matches(r,where))??null,
 findFirst:async({where,orderBy}:any)=>{const found=rows().filter(r=>matches(r,where));if(orderBy)found.sort((a,b)=>b.submittedAt-a.submittedAt||(a.id<b.id?1:-1));return found[0]??null},
 count:async({where}:any)=>rows().filter(r=>matches(r,where)).length,
 create:async({data}:any)=>{if(rows().some(r=>r.id===data.id||unique(r,data)))throw Object.assign(new Error('unique'),{code:'P2002'});const row={id:randomUUID(),...data,submittedAt:new Date(),acceptedAt:new Date(),waitlistRequestedAt:null};rows().push(row);return row},
 update:async({where,data}:any)=>Object.assign(rows().find(r=>matches(r,where)),data)
}}
const proxyModel=()=>new Proxy({},{get:()=>async()=>{writes++;return null}});
const db:any={
 eligibilityScreening:model(()=>screenings,()=>false),
 consentAcceptance:model(()=>acceptances,(a,b)=>a.userId===b.userId&&a.documentVersion===b.documentVersion),
 skinPhoto:proxyModel(),photoCleanup:proxyModel(),user:proxyModel(),appointment:proxyModel(),
 careRoutineRevision:proxyModel(),careRoutineCompletion:proxyModel(),
 careFormRevision:proxyModel(),careFormResponse:proxyModel(),
 assignedMessage:proxyModel(),dermatologist:proxyModel(),
 $queryRaw:async()=>{writes++;return[]},
 $transaction:async(fn:any)=>fn(db)
};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{}};return original.call(this,name,...args)};
const config=require('../src/config/supabase');
config.supabaseAdmin.storage.from=()=>new Proxy({},{get:()=>async()=>({data:null,error:{statusCode:'404'}})});
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:id===C?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/photos',require('../src/routes/photos').default);
app.use('/routines',require('../src/routes/routines').default);
app.use('/care-support',require('../src/routes/care-support').default);
app.use('/messages',require('../src/routes/assigned-messages').default);
app.use('/appointments',require('../src/routes/appointments').default);
app.use('/users',require('../src/routes/users').default);
app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=original;
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{screenings=[];acceptances=[];writes=0;delete process.env.ENROLLMENT_ENFORCEMENT});
async function call(path:string,who:string=A,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':who,'content-type':'application/json'},body:body===undefined||method==='GET'?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const gated:[string,string,any][]=[
 ['POST',`/photos/captures/${randomUUID()}/upload-url`,{}],
 ['POST',`/photos/captures/${randomUUID()}/complete`,{captureDate:'2026-09-01T10:00:00.000Z',notes:''}],
 ['POST','/photos/upload-url',{mimeType:'image/jpeg'}],
 ['POST','/photos/complete-upload',{storagePath:`${A}/${randomUUID()}.jpg`}],
 ['PUT',`/routines/completions/${randomUUID()}`,{revisionId:randomUUID(),completedAt:'2026-09-01T10:00:00.000Z',localDate:'2026-09-01',timeZone:'UTC'}],
 ['PUT',`/care-support/responses/${randomUUID()}`,{formId:randomUUID(),submittedAt:'2026-09-01T10:00:00.000Z',answers:[]}],
 ['PUT',`/messages/patients/${A}/clinicians/${C}/messages/${randomUUID()}`,{content:'Synthetic',reference:null}],
 ['PATCH',`/photos/${randomUUID()}`,{notes:'Synthetic'}],
 ['POST','/appointments',{scheduledDate:'2026-10-01T10:00:00.000Z',type:'consultation',concern:'Synthetic concern text',duration:30}],
 ['PATCH',`/appointments/${randomUUID()}`,{scheduledDate:'2026-10-02T10:00:00.000Z'}],
 ['POST','/users/skin-score',{skinScore:50}],
];
test('unenrolled patients are refused on every gated write before any storage or database write',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 for(const [method,path,body] of gated){const r=await call(path,A,method,body);assert.equal(r.status,403,path);assert.equal(r.body.code,'ENROLLMENT_REQUIRED',path)}
 assert.equal(writes,0);
});
test('multipart legacy upload is refused before the file is parsed',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 const form=new FormData();form.set('photo',new Blob([new Uint8Array([1])],{type:'image/png'}),'x.png');
 const r=await fetch(base+'/photos/upload',{method:'POST',headers:{'x-identity':A},body:form});
 assert.equal(r.status,403);
});
test('enrolled patients, clinicians and disabled enforcement pass the gate',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 screenings.push({id:randomUUID(),userId:A,eligible:true,submittedAt:new Date()});acceptances.push({userId:A,documentVersion:1});
 for(const [method,path,body] of gated)assert.notEqual((await call(path,A,method,body)).body.code,'ENROLLMENT_REQUIRED',path);
 screenings=[];acceptances=[];
 assert.notEqual((await call(`/messages/patients/${A}/clinicians/${C}/messages/${randomUUID()}`,C,'PUT',{content:'Synthetic',reference:null})).body.code,'ENROLLMENT_REQUIRED');
 for(const [method,path,body] of gated)assert.notEqual((await call(path,C,method,body)).body.code,'ENROLLMENT_REQUIRED',`clinician ${path}`);
 process.env.ENROLLMENT_ENFORCEMENT='off';
 for(const [method,path,body] of gated)assert.notEqual((await call(path,A,method,body)).body.code,'ENROLLMENT_REQUIRED',path);
});
test('reads are never gated',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 for(const path of ['/routines/?localDate=2026-09-01','/care-support/form','/messages/current'])assert.notEqual((await call(path,A)).body.code,'ENROLLMENT_REQUIRED',path);
});
test('photo deletion is never gated; a patient can always remove their own photos',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 const r=await call(`/photos/${randomUUID()}`,A,'DELETE');
 assert.notEqual(r.status,403);
 assert.notEqual(r.body.code,'ENROLLMENT_REQUIRED');
 assert.equal(r.body.code,'PHOTO_NOT_FOUND');
});
