import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createPrescriptionRecords} from '../src/services/prescriptionRecords';import {setup,patient,doctor,other,at} from './launch-review-fixture';
const pharmacy={name:'Synthetic Pharmacy',addressLine1:'1 Example Road',addressLine2:null,city:'Raleigh',state:'NC',postalCode:'27601',phone:'9195550100'};
const input={drug:'Synthetic drug',strength:'Synthetic strength',sig:'Synthetic directions',pharmacy,sentAt:at.toISOString()};
function ready(){const s=setup();s.rows.launchCase[0].status='approved';s.rows.launchCase[0].destination={planId:'care',pharmacy};s.rows.identityVerification[0].status='approved';s.rows.careMembership[0].status='active';return {...s,service:createPrescriptionRecords({db:s.db,now:()=>at})}}
test('record external sent prescription once with immutable snapshot, exact replay and audit mapping',async()=>{const s=ready(),id=randomUUID(),a=await s.service.record(patient,doctor,id,input);assert.equal(a.created,true);assert.equal(a.prescription.source,'treatrx_external');assert.deepEqual(a.prescription.pharmacy,pharmacy);assert.equal((await s.service.record(patient,doctor,id,input)).created,false);assert.equal(s.rows.prescription.length,1);assert.equal(s.rows.prescription[0].dosage,input.strength);assert.equal(+s.rows.prescription[0].prescribedDate,+at);await assert.rejects(s.service.record(patient,doctor,id,{...input,sig:'changed'}),{statusCode:409});s.rows.user[0].dermatologistId=other;await assert.rejects(s.service.record(patient,doctor,id,input),{statusCode:404})});
test('pending identity, latest negative NC, expired payment block writes; fresh true correction allows',async()=>{const s=ready();s.rows.identityVerification[0].status='uploaded';await assert.rejects(s.service.record(patient,doctor,randomUUID(),input),{code:'LAUNCH_STEP_REQUIRED'});s.rows.identityVerification[0].status='approved';s.rows.launchCheckInSubmission.push({patientId:patient,submittedAt:at,answers:{physicallyInNC:false}});await assert.rejects(s.service.record(patient,doctor,randomUUID(),input),{code:'LAUNCH_STEP_REQUIRED'});s.rows.launchCheckInSubmission.push({patientId:patient,submittedAt:new Date(+at+1),answers:{physicallyInNC:true}});await s.service.record(patient,doctor,randomUUID(),input);s.rows.careMembership[0].paidThrough=at;await assert.rejects(s.service.record(patient,doctor,randomUUID(),input),{code:'CARE_ACCESS_REQUIRED'});assert.equal((await s.service.list(patient)).data.length,1)});
test('required fields complete pharmacy and nonfuture time validated before recording',async()=>{const s=ready();for(const bad of [{...input,drug:' '},{...input,pharmacy:{...pharmacy,phone:''}},{...input,sentAt:new Date(+at+1).toISOString()}])await assert.rejects(s.service.record(patient,doctor,randomUUID(),bad));assert.equal(s.rows.prescription.length,0)});
import express from 'express';import {prisma} from '../src/config/database';
test('legacy create and patch enforce live launch prerequisites inside assignment lock; audit rows immutable',async()=>{
 process.env.SUPABASE_URL='https://synthetic.example.invalid';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const router=(await import('../src/routes/prescriptions')).default,errorHandler=(await import('../src/middleware/errorHandler')).errorHandler;
 const s=ready(),original=prisma.$transaction;(prisma as any).$transaction=s.db.$transaction;
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.user={id:doctor,userType:'dermatologist'};next()});app.use('/',router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});const base=`http://127.0.0.1:${(server.address() as any).port}`;
 async function call(path:string,method:string,body:any){return fetch(base+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
 try{
  const body={patientId:patient,medicationName:'Synthetic',dosage:'Synthetic',instructions:'Synthetic'};
  s.rows.identityVerification[0].status='uploaded';assert.equal((await call('/','POST',body)).status,403);s.rows.identityVerification[0].status='approved';s.rows.careMembership[0].paidThrough=new Date('2090-01-01Z');assert.equal((await call('/','POST',body)).status,201);
  const legacy=s.rows.prescription[0];legacy.patient={dermatologistId:doctor};s.rows.launchCheckInSubmission.push({patientId:patient,submittedAt:at,answers:{physicallyInNC:false}});assert.equal((await call('/'+legacy.id,'PATCH',{dosage:'updated'})).status,403);s.rows.launchCheckInSubmission=[];assert.equal((await call('/'+legacy.id,'PATCH',{dosage:'updated'})).status,200);
  const sentId=randomUUID();await s.service.record(patient,doctor,sentId,input);assert.equal((await call('/'+sentId,'PATCH',{dosage:'changed'})).status,409);
  s.rows.launchCase[0].intakeId=randomUUID();s.rows.intakeRevision.push({id:s.rows.launchCase[0].intakeId,questionnaireVersion:INTAKE_V2,answers:validIntakeV2Answers});assert.equal((await call('/','POST',body)).status,403);assert.equal((await call('/'+legacy.id,'PATCH',{dosage:'v2 must use recorder'})).status,403);s.rows.launchCase[0].intakeId=null;
  const query=s.db.$queryRaw;s.db.$queryRaw=async()=>{s.rows.user[0].dermatologistId=other;return []};assert.equal((await call('/','POST',body)).status,404);s.db.$queryRaw=query;
 }finally{(prisma as any).$transaction=original;await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
test('identical valid timestamps without fractional seconds replay after canonical storage',async()=>{const s=ready(),id=randomUUID(),body={...input,sentAt:'2027-01-01T15:00:00Z'};await s.service.record(patient,doctor,id,body);assert.equal((await s.service.record(patient,doctor,id,body)).created,false)});

test('plan-switch destination requirements block recorder and shared legacy guard until matching complete destination is saved',async()=>{
 const s=ready();let row=s.rows.launchCase[0],m=s.rows.careMembership[0];m.planId='all_in';m.destinationRequired=true;
 const {assertLaunchPrescriptionAccess}=await import('../src/services/careAccess');
 const blocked=async()=>{await assert.rejects(s.service.record(patient,doctor,randomUUID(),input),{code:'LAUNCH_STEP_REQUIRED'});await assert.rejects(assertLaunchPrescriptionAccess(s.db,patient,at),{code:'LAUNCH_STEP_REQUIRED'});row=s.rows.launchCase[0];m=s.rows.careMembership[0]};
 await blocked();m.destinationRequired=false;await blocked();
 row.destination={planId:'all_in',pharmacy:'vida',shippingAddress:{recipient:'Synthetic Example',line1:'1 Example Road',line2:null,city:'Raleigh',state:'NC',postalCode:''}};await blocked();
 row.destination.shippingAddress.postalCode='27601';const result=await s.service.record(patient,doctor,randomUUID(),input);assert.deepEqual(result.prescription.pharmacy,pharmacy);
 m.planId='care';m.destinationRequired=true;await blocked();m.destinationRequired=false;await blocked();row.destination={planId:'care',pharmacy};await assertLaunchPrescriptionAccess(s.db,patient,at);
});

import {INTAKE_V2,validIntakeV2Answers} from '../src/services/intakeV2';
test('v2 prescription screening enforces exclusions, IBD determination and documented sunscreen',async()=>{const s=ready(),row=s.rows.launchCase[0];row.intakeId=randomUUID();s.rows.intakeRevision.push({id:row.intakeId,questionnaireVersion:INTAKE_V2,answers:{...validIntakeV2Answers,B1:'female',B2:'no',B5:'no',B6:['none'],D4:['ibd'],C4:'no'}});
 const doxy={...input,drug:'Doxycycline',strength:'100 mg'};await assert.rejects(s.service.record(patient,doctor,randomUUID(),doxy),{code:'LAUNCH_STEP_REQUIRED'});s.rows.launchCase[0].eligibility={screeningDecisions:{ibd:{activity:'inactive',priorCDifficile:false,decisionNote:'Confirmed in messaging'}}};await s.service.record(patient,doctor,randomUUID(),doxy);
 s.rows.launchCase[0].eligibility.screeningDecisions.ibd.priorCDifficile=true;await assert.rejects(s.service.record(patient,doctor,randomUUID(),doxy),{code:'LAUNCH_STEP_REQUIRED'});
 const hq={...input,drug:'Hydroquinone',strength:'4%'};await assert.rejects(s.service.record(patient,doctor,randomUUID(),hq),{code:'LAUNCH_STEP_REQUIRED'});s.rows.launchCase[0].eligibility.screeningDecisions.dailySunscreenConfirmed=true;await s.service.record(patient,doctor,randomUUID(),hq);
});
