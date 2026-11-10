import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
const patient='11111111-1111-4111-8111-111111111111',clinician='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';process.env.ENROLLMENT_ENFORCEMENT='off';
let appointmentStatus='scheduled';
let caseRow:any,membership:any,nc=true,assigned=clinician,writes=0,locked=false,afterLock:(()=>void)|undefined;
const empty={findUnique:async()=>null,findFirst:async()=>null,findMany:async()=>[],count:async()=>0,create:async({data}:any)=>{writes++;return {...data,sentAt:new Date()}},update:async({data}:any)=>{writes++;return {id,...data}}};
const db:any={launchCase:{findUnique:async()=>caseRow},careMembership:{findUnique:async()=>membership},identityVerification:{findUnique:async()=>({attestedInNC:true})},launchCheckInSubmission:{findFirst:async()=>({answers:{physicallyInNC:nc}})},user:{...empty,findUnique:async({where}:any)=>where.dermatologistId&&where.dermatologistId!==assigned?null:({id:patient,name:'Synthetic',dermatologistId:assigned})},dermatologist:{findUnique:async()=>({id:clinician,name:'Synthetic clinician'})},assignedMessage:{...empty},careRoutineRevision:{...empty},careFormRevision:{...empty},appointment:{...empty,findUnique:async()=>({id,patientId:patient,dermatologistId:clinician,status:appointmentStatus})},$queryRaw:async()=>{locked=true;afterLock?.();afterLock=undefined;return[]},$transaction:async(fn:any)=>fn(db)};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}}};return original.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const identity=req.header('x-identity');if(!identity)return res.sendStatus(401);req.user={id:identity,userType:identity===patient||identity===other?'patient':'dermatologist',email:'synthetic@example.invalid'};next()});
app.use('/messages',require('../src/routes/assigned-messages').default);app.use('/appointments',require('../src/routes/appointments').default);app.use('/photos',require('../src/routes/photos').default);app.use('/users',require('../src/routes/users').default);app.use(require('../src/middleware/errorHandler').errorHandler);
const routine=require('../src/services/routineCare'),care=require('../src/services/careSupport');(Module as any)._load=original;
let server:any,base:string;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`});after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{appointmentStatus='scheduled';caseRow={id,status:'approved',identityId:id};membership={status:'active',paidThrough:new Date(Date.now()+86400000)};nc=true;assigned=clinician;writes=0;locked=false;afterLock=undefined});
async function call(path:string,identity=patient,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':identity,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const pair=`/messages/patients/${patient}/clinicians/${clinician}`;
test('paid submitted and needs_changes patients and their clinician can send clarification and read history',async()=>{for(const status of ['submitted','needs_changes']){caseRow.status=status;membership.status='paid_pending_review';for(const who of [patient,clinician]){assert.equal((await call(pair+'/messages/'+id,who,'PUT',{content:'Synthetic clarification',reference:null})).status,201);assert.equal((await call(pair,who)).status,200)}}});
test('clarification denies unpaid patients, unrelated patients and newly reassigned clinicians under the patient lock',async()=>{membership.paidThrough=null;assert.equal((await call(pair+'/messages/'+id,patient,'PUT',{content:'Synthetic',reference:null})).status,403);membership.paidThrough=new Date(Date.now()+86400000);assert.equal((await call(pair,other)).status,404);afterLock=()=>{assigned=other};assert.equal((await call(pair+'/messages/'+id,clinician,'PUT',{content:'Synthetic',reference:null})).status,404);assert.equal(writes,0)});
test('clinician routine and form writes enforce pending, expiry and latest negative NC evidence inside lock',async()=>{for(const state of ['pending','expired','outsideNC']){caseRow.status=state==='pending'?'submitted':'approved';membership.paidThrough=new Date(Date.now()+(state==='expired'?-1:86400000));nc=state!=='outsideNC';for(const save of [()=>routine.saveRevision(patient,clinician,'morning',id,{expectedRevisionId:null,name:'Synthetic',isActive:false,steps:[]}),()=>care.saveForm(patient,clinician,id,{expectedRevisionId:null,title:'Synthetic',isActive:false,questions:[]})]){await assert.rejects(save(),{statusCode:403});assert.equal(locked,true)}}assert.equal(writes,0)});
test('clinician appointment update cannot bypass launch access while owner cancellation remains reachable',async()=>{membership.paidThrough=null;assert.equal((await call('/appointments/'+id,clinician,'PATCH',{status:'confirmed'})).status,403);assert.equal(writes,0);assert.equal((await call('/appointments/'+id,patient,'DELETE')).status,200)});
test('launch skin score mutation is rejected even when approved paid and legacy enforcement is off',async()=>{assert.equal((await call('/users/skin-score',patient,'POST',{skinScore:80})).status,403);assert.equal(writes,0);assert.equal(locked,true)});
test('legacy skin score keeps its numeric envelope and increment after explicit no-case lookup',async()=>{caseRow=null;const r=await call('/users/skin-score',patient,'POST',{skinScore:80});assert.equal(r.status,200);assert.equal(r.body.user.currentSkinScore,80);assert.deepEqual(r.body.user.streakCount,{increment:1});assert.equal(writes,1)});

test('legacy photo writes cannot change launch scores or submitted photos with enforcement disabled',async()=>{
 for(const status of ['submitted','approved']){caseRow.status=status;for(const [path,method,body] of [
 ['/photos/captures/'+id+'/upload-url','POST',{}],['/photos/captures/'+id+'/complete','POST',{captureDate:new Date().toISOString(),notes:''}],
 ['/photos/upload-url','POST',{mimeType:'image/jpeg'}],['/photos/complete-upload','POST',{storagePath:patient+'/'+id+'.jpg',skinScore:99}],
 ['/photos/'+id,'PATCH',{skinScore:99,notes:'Synthetic'}],['/photos/'+id,'DELETE',undefined],
 ] as const)assert.equal((await call(path,patient,method,body)).status,403)}assert.equal(writes,0);
});
test('every launch case rejects legacy scoring without changing stored historical values',async()=>{
 for(const status of ['consents','payment','submitted','needs_changes','approved','rejected']){caseRow.status=status;membership=null;assert.equal((await call('/users/skin-score',patient,'POST',{skinScore:99,photoId:id})).status,403)}assert.equal(writes,0);
});
test('own cancellation PATCH and historic/profile reads remain reachable after coverage ends',async()=>{
 membership.status='ended';membership.paidThrough=null;nc=false;
 const cancelled=await call('/appointments/'+id,patient,'PATCH',{status:'cancelled'});assert.equal(cancelled.status,200);assert.equal(cancelled.body.appointment.status,'cancelled');
 assert.equal((await call('/users/profile')).status,200);assert.equal((await call(pair)).status,200);
});
test('appointment assignment is rechecked after locking for clinician update and cancellation',async()=>{
 for(const method of ['PATCH','DELETE']){assigned=clinician;afterLock=()=>{assigned=other};assert.equal((await call('/appointments/'+id,clinician,method,method==='PATCH'?{status:'confirmed'}:undefined)).status,403)}assert.equal(writes,0);
});
test('routine completion and legacy form response recheck paid access after lock',async()=>{
 for(const save of [()=>routine.saveCompletion(patient,id,{revisionId:id,completedAt:new Date().toISOString(),localDate:'2026-11-09',timeZone:'UTC'}),()=>care.saveResponse(patient,id,{formId:id,submittedAt:new Date().toISOString(),answers:[]})]){
  membership.paidThrough=new Date(Date.now()+86400000);afterLock=()=>{membership.paidThrough=null};await assert.rejects(save(),{statusCode:403});
 }assert.equal(writes,0);
});
test('missing launch model fails closed instead of granting legacy write access',async()=>{
 const model=db.launchCase;db.launchCase=undefined;try{assert.equal((await call('/users/skin-score',patient,'POST',{skinScore:99})).status,500);assert.equal(writes,0)}finally{db.launchCase=model}
});

test('both cancellation methods recheck completed status after obtaining the patient lock',async()=>{
 for(const method of ['PATCH','DELETE']){appointmentStatus='scheduled';afterLock=()=>{appointmentStatus='completed'};const r=await call('/appointments/'+id,patient,method,method==='PATCH'?{status:'cancelled'}:undefined);assert.equal(r.status,400);assert.equal(r.body.code,'CANNOT_CANCEL_COMPLETED')}assert.equal(writes,0);
});
test('appointment success is only sent after the transaction commits',async()=>{
 const transaction=db.$transaction;db.$transaction=async(fn:any)=>{await fn(db);throw new Error('Synthetic commit failure')};
 try{assert.equal((await call('/appointments/'+id,patient,'DELETE')).status,500)}finally{db.$transaction=transaction}
});
