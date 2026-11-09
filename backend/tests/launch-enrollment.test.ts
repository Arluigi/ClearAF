import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createLaunchEnrollment} from '../src/services/launchEnrollment';
import {fixtures} from '../src/contracts/unzitLaunch';
const A=randomUUID(), B=randomUUID(), clinician=randomUUID();
const catalog=structuredClone(fixtures['GET /catalog'].response);
for(const d of catalog.consents){d.body='DRAFT Synthetic '+d.key;d.sha256=createHash('sha256').update(d.body).digest('hex')}
function setup(){
 const rows:Record<string,any[]>={launchCase:[],identityVerification:[],intakeRevision:[],consentAcceptance:[],careMembership:[],clinicalPhotoSet:[],clinicalPhotoSetItem:[],skinPhoto:[],launchCheckIn:[],photoCleanup:[],dermatologist:[{id:clinician}],launchSettings:[{id:randomUUID(),version:1,active:true,contentVersion:'0.9-draft',content:catalog,clinicianId:clinician}],user:[{id:A,dermatologistId:null},{id:B,dermatologistId:null}]};
 const match=(r:any,w:any={})=>Object.entries(w).every(([k,v]:any)=>v&&typeof v==='object'&&!(v instanceof Date)?v.in?v.in.includes(r[k]):false:r[k]===v);
 const db:any={};for(const name of Object.keys(rows)){const r=rows[name];db[name]={findUnique:async({where}:any)=>r.find(x=>match(x,where))??null,findFirst:async({where}:any={})=>r.find(x=>match(x,where))??null,findMany:async({where}:any={})=>r.filter(x=>match(x,where)),create:async({data}:any)=>{const value={id:randomUUID(),createdAt:new Date(),acceptedAt:new Date(),...data};r.push(value);return value},update:async({where,data}:any)=>{const value=r.find(x=>match(x,where));Object.assign(value,data);return value},deleteMany:async({where}:any)=>{for(let i=r.length-1;i>=0;i--)if(match(r[i],where))r.splice(i,1)}}}
 let queue=Promise.resolve();db.$queryRaw=async()=>[];db.$transaction=async(fn:any)=>{const prev=queue;let release:any;queue=new Promise(r=>release=r);await prev;try{return await fn(db)}finally{release()}};
 const objects=new Map<string,Buffer>();const service=createLaunchEnrollment({db,store:async(path,bytes)=>{if(objects.has(path))throw Error('Synthetic object already exists');objects.set(path,bytes)},remove:async(path:string)=>{objects.delete(path)},now:()=>new Date('2026-11-09T18:00:00.000Z')});return {rows,service,objects,db};
}
async function begin(s:ReturnType<typeof setup>){let r=await s.service.get(A);r=await s.service.consents(A,r.response.case.id,{expectedRevision:0,acceptances:catalog.consents.map(({key,version,sha256}:any)=>({key,version,sha256}))},'127.0.0.1');return r.response}
const jpeg=()=>sharp({create:{width:100,height:100,channels:3,background:'#ccbb99'}}).jpeg().toBuffer();
test('concurrent first reads create one patient-owned case; foreign ids never resolve',async()=>{const s=setup();const [a,b]=await Promise.all([s.service.get(A),s.service.get(A)]);assert.equal(a.response.case.id,b.response.case.id);assert.equal(s.rows.launchCase.length,1);await assert.rejects(s.service.eligibility(B,a.response.case.id,{expectedRevision:0,answers:{}}),{statusCode:404})});
test('four current receipts are atomic, stale hashes rejected and identical replay succeeds',async()=>{const s=setup();const r=await s.service.get(A),id=r.response.case.id;const good={expectedRevision:0,acceptances:catalog.consents.map(({key,version,sha256}:any)=>({key,version,sha256}))};await assert.rejects(s.service.consents(A,id,{...good,acceptances:good.acceptances.map((a:any,i:number)=>i===0?{...a,sha256:'f'.repeat(64)}:a)},'127.0.0.1'),{code:'CONSENT_OUTDATED'});assert.equal(s.rows.consentAcceptance.length,0);const a=await s.service.consents(A,id,good,'127.0.0.1');const b=await s.service.consents(A,id,good,'127.0.0.1');assert.equal(a.response.case.revision,b.response.case.revision);assert.equal(b.created,false);assert.equal(s.rows.consentAcceptance.length,4)});
test('paid-only medical history, revision conflict, immutable submitted package and full resume',async()=>{
 const s=setup();let e=await begin(s);const id=e.case.id,identityId=randomUUID(),bytes=await jpeg();
 let r=await s.service.identity(A,id,identityId,{expectedRevision:String(e.case.revision),fullName:'Synthetic Example',dateOfBirth:'1990-01-01',physicallyInNC:'true',idPhoto:bytes,selfie:bytes});e=r.response;assert.equal(e.case.identity.status,'uploaded');assert.equal(s.rows.skinPhoto.length,0);
 r=await s.service.eligibility(A,id,{expectedRevision:e.case.revision,answers:{E1:'acne',E2:'yes',E3:'pregnant',E4:'no'}});e=r.response;
 const medical=fixtures['PUT /enrollment/:caseId/medical/:revisionId'].request.answers;
 await assert.rejects(s.service.medical(A,id,randomUUID(),{expectedRevision:e.case.revision,questionnaireVersion:'0.9-draft',answers:medical}),{code:'CARE_ACCESS_REQUIRED'});
 s.rows.careMembership.push({...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:id,patientId:A,planId:'care',status:'paid_pending_review',paidThrough:new Date('2026-12-09T18:00:00Z')});
 await assert.rejects(s.service.medical(A,id,randomUUID(),{expectedRevision:0,questionnaireVersion:'0.9-draft',answers:medical}),{code:'REVISION_CONFLICT'});
 const revisionId=randomUUID();r=await s.service.medical(A,id,revisionId,{expectedRevision:e.case.revision,questionnaireVersion:'0.9-draft',answers:medical});e=r.response;const saved=e.case.revision;
 r=await s.service.medical(A,id,revisionId,{expectedRevision:saved-1,questionnaireVersion:'0.9-draft',answers:medical});assert.equal(r.created,false);assert.equal(r.response.case.revision,saved);
 const items=[];for(const slot of ['front','left','right']){const captureId=randomUUID();const captured=await s.service.capture(A,captureId,{targetType:'enrollment',targetId:id,captureDate:'2026-11-09T17:00:00.000Z',photo:bytes});items.push({slot,photoId:captured.capture.id,captureId})}
 const setId=randomUUID();const set=await s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items});assert.equal(set.photoSet.requiredSlots.length,3);assert.equal((await s.service.get(A)).response.case.status,'destination');
 r=await s.service.destination(A,id,{expectedRevision:e.case.revision,destination:fixtures['PUT /enrollment/:caseId/destination'].request.destination});e=r.response;
 r=await s.service.submit(A,id,{expectedRevision:e.case.revision,photoSetId:setId});e=r.response;assert.equal(e.case.status,'submitted');assert.equal(s.rows.user[0].dermatologistId,clinician);assert.ok(s.rows.intakeRevision[0].attestedAt);assert.equal(s.rows.launchCase[0].settingsVersion,1);
 const again=await s.service.submit(A,id,{expectedRevision:e.case.revision-1,photoSetId:setId});assert.equal(again.created,false);assert.equal(again.response.case.revision,e.case.revision);
 await assert.rejects(s.service.medical(A,id,randomUUID(),{expectedRevision:e.case.revision,questionnaireVersion:'0.9-draft',answers:medical}),{code:'LAUNCH_STEP_REQUIRED'});
});
test('photo sets require distinct complete owned angles and deterministic capture identities',async()=>{const s=setup();let e=await begin(s);const id=e.case.id;s.rows.launchCase[0].status='photos';s.rows.careMembership.push({id:randomUUID(),caseId:id,patientId:A,status:'paid_pending_review',planId:'care'});const photoId=randomUUID();s.rows.skinPhoto.push({id:photoId,userId:B});await assert.rejects(s.service.photoSet(A,randomUUID(),{purpose:'enrollment',targetId:id,items:[{slot:'front',photoId,captureId:randomUUID()}]}));assert.equal((await s.service.photoSet(A,randomUUID(),{purpose:'enrollment',targetId:id,items:[]})).photoSet.items.length,0)});
import {assertLegacyPhotoWriter,assertMutableLaunchPhoto} from '../src/services/clinicalPhotoSets';
test('legacy upload/mutation lanes cannot bypass launch orchestration; submitted associations freeze photos',async()=>{

 await assert.rejects(assertLegacyPhotoWriter({launchCase:{findUnique:async()=>({id:randomUUID()})}},A),{code:'LAUNCH_STEP_REQUIRED'});
 await assert.doesNotReject(assertLegacyPhotoWriter({launchCase:{findUnique:async()=>null}},A));
 const frozen={clinicalPhotoSetItem:{findFirst:async()=>({setId:'synthetic'})},clinicalPhotoSet:{findUnique:async()=>({status:'submitted'})}};
 await assert.rejects(assertMutableLaunchPhoto(frozen,'synthetic'),{code:'OPERATION_CONFLICT'});
});
test('draft sets allow partial/empty retakes; legacy and foreign-target captures never satisfy launch slots',async()=>{
 const s=setup();const e=await begin(s),id=e.case.id;const row=s.rows.launchCase[0];row.status='photos';s.rows.careMembership.push({...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:id,patientId:A,planId:'care',status:'paid_pending_review'});
 const setId=randomUUID();assert.deepEqual((await s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[]})).photoSet.items,[]);
 const bytes=await jpeg(),captureId=randomUUID();const captured=await s.service.capture(A,captureId,{targetType:'enrollment',targetId:id,captureDate:'2026-11-09T17:00:00.000Z',photo:bytes});
 await s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[{slot:'front',photoId:captured.capture.id,captureId}]});assert.equal((await s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[]})).photoSet.items.length,0);
 const photo=s.rows.skinPhoto[0];photo.launchTargetId=randomUUID();await assert.rejects(s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[{slot:'front',photoId:photo.id,captureId}]}),{code:'OPERATION_CONFLICT'});
 photo.launchTargetId=id;photo.launchRequestHash=null;await assert.rejects(s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[{slot:'front',photoId:photo.id,captureId}]}),{code:'OPERATION_CONFLICT'});
});
test('capture retry compares exact bytes and target, not only date and notes',async()=>{
 const s=setup();const e=await begin(s),id=e.case.id;s.rows.launchCase[0].status='photos';s.rows.careMembership.push({...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:id,patientId:A,planId:'care',status:'paid_pending_review'});
 const captureId=randomUUID(),input={targetType:'enrollment',targetId:id,captureDate:'2026-11-09T17:00:00.000Z',photo:await jpeg()};const first=await s.service.capture(A,captureId,input);assert.equal((await s.service.capture(A,captureId,input)).created,false);
 const changed=await sharp({create:{width:100,height:100,channels:3,background:'blue'}}).jpeg().toBuffer();await assert.rejects(s.service.capture(A,captureId,{...input,photo:changed}),{code:'OPERATION_CONFLICT'});assert.equal(s.rows.skinPhoto.length,1);
});
test('failed metadata transaction cleans uploaded bytes before capture retry',async()=>{
 const s=setup();const e=await begin(s),id=e.case.id;s.rows.launchCase[0].status='photos';s.rows.careMembership.push({...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:id,patientId:A,planId:'care',status:'paid_pending_review'});
 const create=s.db.skinPhoto.create;let fail=true;s.db.skinPhoto.create=async(args:any)=>{if(fail){fail=false;throw Error('synthetic metadata failure')}return create(args)};
 const input={targetType:'enrollment',targetId:id,captureDate:'2026-11-09T17:00:00.000Z',photo:await jpeg()},captureId=randomUUID();
 await assert.rejects(s.service.capture(A,captureId,input));assert.equal(s.objects.size,0);assert.equal((await s.service.capture(A,captureId,input)).created,true);assert.equal(s.objects.size,1);
});
test('identity metadata failure compensates both distinct image objects',async()=>{
 const s=setup();const e=await begin(s),bytes=await jpeg();s.db.identityVerification.create=async()=>{throw Error('Synthetic metadata failure')};
 await assert.rejects(s.service.identity(A,e.case.id,randomUUID(),{expectedRevision:String(e.case.revision),fullName:'Synthetic Example',dateOfBirth:'1990-01-01',physicallyInNC:'true',idPhoto:bytes,selfie:bytes}));assert.equal(s.objects.size,0);assert.equal(s.rows.photoCleanup.length,0);
});
test('incomplete medical drafts resume history and edited sites refresh draft required slots',async()=>{
 const s=setup();const e=await begin(s),id=e.case.id;s.rows.launchCase[0].status='medical_history';s.rows.careMembership.push({...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:id,patientId:A,planId:'care',status:'paid_pending_review'});
 const draft=await s.service.medical(A,id,randomUUID(),{expectedRevision:e.case.revision,questionnaireVersion:'0.9-draft',answers:{M1:'male'}});assert.equal(draft.response.case.status,'medical_history');
 s.rows.launchCase[0].status='photos';const setId=randomUUID();await s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[]});s.rows.intakeRevision[0].answers={...s.rows.intakeRevision[0].answers,M6:['chest','back']};const changed=await s.service.photoSet(A,setId,{purpose:'enrollment',targetId:id,items:[]});assert.deepEqual(changed.photoSet.requiredSlots,['front','left','right','chest','back']);
});
import {identityObjectPaths} from '../src/services/identityVerification';
import {captureIdentity} from '../src/services/photoCapture';
test('pending identity or skin cleanup quarantines its deterministic path without retry deletion or writes',async()=>{
 const s=setup();const e=await begin(s),identityId=randomUUID(),bytes=await jpeg(),path=identityObjectPaths(A,identityId).idPhotoPath;
 s.rows.photoCleanup.push({photoId:path.split('/')[1].slice(0,36),userId:A,photoUrl:path});s.objects.set(path,bytes);
 await assert.rejects(s.service.identity(A,e.case.id,identityId,{expectedRevision:String(e.case.revision),fullName:'Synthetic Example',dateOfBirth:'1990-01-01',physicallyInNC:'true',idPhoto:bytes,selfie:bytes}),{code:'OPERATION_CONFLICT'});
 assert.equal(s.objects.size,1);assert.equal(s.rows.photoCleanup.length,1);assert.equal(s.rows.identityVerification.length,0);
 s.rows.launchCase[0].status='photos';s.rows.careMembership.push({...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:e.case.id,patientId:A,planId:'care',status:'paid_pending_review'});
 const captureId=randomUUID(),skin=captureIdentity(A,captureId);s.rows.photoCleanup.push({photoId:skin.id,userId:A,photoUrl:skin.storagePath});s.objects.set(skin.storagePath,bytes);
 await assert.rejects(s.service.capture(A,captureId,{targetType:'enrollment',targetId:e.case.id,captureDate:'2026-11-09T17:00:00.000Z',photo:bytes}),{code:'OPERATION_CONFLICT'});
 assert.equal(s.objects.size,2);assert.equal(s.rows.photoCleanup.length,2);assert.equal(s.rows.skinPhoto.length,0);
});
test('paid editable cases reconsent to rotated documents without resetting their stage or membership',async()=>{
 const s=setup();const e=await begin(s),id=e.case.id;s.rows.launchCase[0].status='photos';const membership={...fixtures['GET /billing'].response.membership,id:randomUUID(),caseId:id,patientId:A,planId:'care',status:'paid_pending_review'};s.rows.careMembership.push(membership);
 const updated=structuredClone(catalog);for(const d of updated.consents){d.version=2;d.body='DRAFT rotated '+d.key;d.sha256=createHash('sha256').update(d.body).digest('hex')};s.rows.launchSettings[0].active=false;s.rows.launchSettings.push({id:randomUUID(),version:2,active:true,contentVersion:'0.9-draft',content:updated,clinicianId:clinician});
 const r=await s.service.consents(A,id,{expectedRevision:e.case.revision,acceptances:updated.consents.map(({key,version,sha256}:any)=>({key,version,sha256}))},'127.0.0.1');assert.equal(r.response.case.status,'photos');assert.equal(r.response.membership.id,membership.id);assert.equal(r.response.consents.every((d:any)=>d.version===2&&d.acceptedAt),true);assert.equal(s.rows.consentAcceptance.length,8);
});
test('historical frozen cases retain their accepted publication through active content rotation or invalid publication',async()=>{
 const s=setup();const e=await begin(s),row=s.rows.launchCase[0];row.status='submitted';row.submittedAt=new Date('2026-11-09T18:00:00.000Z');row.settingsVersion=1;
 const updated=structuredClone(catalog);for(const d of updated.consents){d.version=2;d.body='DRAFT rotated '+d.key;d.sha256=createHash('sha256').update(d.body).digest('hex')};s.rows.launchSettings[0].active=false;s.rows.launchSettings.push({id:randomUUID(),version:2,active:true,contentVersion:'1.0-draft',content:updated,clinicianId:clinician});
 let r=await s.service.get(A);assert.equal(r.response.consents.every((d:any)=>d.version===1&&d.acceptedAt),true);assert.equal(r.response.consents[0].body,catalog.consents[0].body);
 s.rows.launchSettings[1].content={};for(const status of ['submitted','approved','rejected']){row.status=status;r=await s.service.get(A);assert.equal(r.response.consents.every((d:any)=>d.version===1&&d.acceptedAt),true)}
});
