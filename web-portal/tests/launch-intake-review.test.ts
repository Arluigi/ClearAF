import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { launchApprovalBlock, intakeAnswer, consentReceipts } from '../src/lib/workspace';
import { ProtectedIdentityImages } from '../src/components/patients/IdentityReview';
import { LaunchIntakeDetails } from '../src/components/patients/LaunchIntakeReview';
import type { LaunchEnrollmentResponse, LaunchCatalog } from '../src/types/api';
function enrollment():LaunchEnrollmentResponse { return {case:{id:'case',revision:1,status:'submitted',identity:{id:'id',status:'approved',fullName:'Synthetic Patient',dateOfBirth:'1990-01-01',attestedInNC:true,attestedAt:'2026-11-09T12:00:00Z',reviewedAt:null,reviewedBy:null,patientMessage:null},eligibility:{answers:{E1:'acne',E2:'no',E3:'neither',E4:'no'},eligible:true,reasons:[],flags:[],rulesVersion:'0.9-draft'},medicalHistory:{M1:'male',M2:null,M9:{signs:[],none:true,details:null},medicationPreference:'no_preference'},questionnaireVersion:'0.9-draft',photoSet:{id:'set',purpose:'enrollment',status:'submitted',requiredSlots:['front','left','right'],items:['front','left','right'].map(slot=>({slot:slot as 'front',photoId:slot,captureId:slot}))},destination:{planId:'care',pharmacy:{name:'Synthetic Pharmacy',addressLine1:'1 Test Way',addressLine2:null,city:'Raleigh',state:'NC',postalCode:'27601',phone:'5550100100'}},planId:'care',flags:[],submittedAt:'2026-11-09T12:00:00Z',approvedAt:null,patientMessage:null},membership:{id:'m',planId:'care',status:'paid_pending_review',amountCents:3900,currency:'usd',activatedAt:null,currentPeriodEnd:null,paidThrough:null,cancelAtPeriodEnd:false,cadenceAnchor:null,refundStatus:'not_applicable',access:'enrollment'},consents:['telehealth','medication','privacy_notice','subscription_terms'].map(key=>({key:key as 'telehealth',version:1,versionLabel:'0.9-draft',title:key,body:'DRAFT',sha256:'hash',effectiveAt:'2026-11-01T00:00:00Z',acceptedAt:'2026-11-09T12:00:00Z'}))};}
test('approval requires manual server identity approval, four receipts, submitted package and NC',()=>{
 const e=enrollment();assert.equal(launchApprovalBlock(e),null);e.case.identity!.status='uploaded';assert.match(launchApprovalBlock(e)!,/identity/i);e.case.identity!.status='approved';e.consents.pop();assert.match(launchApprovalBlock(e)!,/consent/i);
 const missing=enrollment();missing.case.photoSet!.items.pop();assert.match(launchApprovalBlock(missing)!,/photo/i);const nc=enrollment();nc.case.identity!.attestedInNC=false;assert.match(launchApprovalBlock(nc)!,/NC/);
});
test('receipts preserve versions and branch answers preserve null, none and preference',()=>{
 const e=enrollment();assert.match(consentReceipts(e.consents)[0].text,/0.9-draft/);assert.equal(intakeAnswer(null),'Not applicable');assert.match(intakeAnswer(e.case.medicalHistory.M9),/None/);
 const catalog={contractVersion:1,settingsVersion:1,plans:[],consents:[],reviewCopy:'Review within 1 to 2 business days.',questionnaireVersion:'0.9-draft',eligibilityQuestions:[],medicalQuestions:[{id:'M1',prompt:'Sex assigned at birth',kind:'choice',required:true,options:[{id:'male',label:'Male'}],fields:[],showWhen:[]},{id:'medicationPreference',prompt:'Medication preference',kind:'choice',required:true,options:[{id:'no_preference',label:'No preference'}],fields:[],showWhen:[]}]} as LaunchCatalog;
 const html=renderToStaticMarkup(h(LaunchIntakeDetails,{enrollment:e,catalog}));assert.match(html,/Male/);assert.match(html,/No preference/);assert.match(html,/DRAFT/);assert.match(html,/M22/);
});
test('identity bytes are no-store, refreshed through authorization and revoked on close or patient change',async()=>{
 let authorizations=0,creates=0;const revoked:string[]=[];let now=0;
 const images=new ProtectedIdentityImages(async()=>{authorizations++;return {idPhoto:{url:'https://example.invalid/id',expiresAt:'2026-11-09T12:05:00Z'},selfie:{url:'https://example.invalid/selfie',expiresAt:'2026-11-09T12:05:00Z'}};},async(_input,options)=>{assert.equal(options?.cache,'no-store');assert.equal(options?.referrerPolicy,'no-referrer');return new Response(new Blob(['synthetic bytes']));},{createObjectURL:()=>`blob:${++creates}`,revokeObjectURL:x=>revoked.push(x)},()=>now);
 await images.load();assert.equal(images.snapshot().status,'ready');await images.load();assert.equal(authorizations,2);assert.deepEqual(revoked,['blob:1','blob:2']);images.dispose();assert.deepEqual(revoked,['blob:1','blob:2','blob:3','blob:4']);assert.equal(images.snapshot().data,null);
 now=Date.parse('2026-11-09T12:06:00Z');await images.load();assert.equal(images.snapshot().status,'error');
});
test('closing identity while authorization is pending cannot publish images',async()=>{
 let finish!:(x:never)=>void;const images=new ProtectedIdentityImages(()=>new Promise(resolve=>{finish=resolve;}));const pending=images.load();images.dispose();finish({idPhoto:{},selfie:{}} as never);await pending;assert.equal(images.snapshot().data,null);
});
test('saved questionnaire never adopts labels from a newer active version',()=>{
 const e=enrollment();const catalog={questionnaireVersion:'1.0',medicalQuestions:[{id:'M1',prompt:'Changed prompt',options:[{id:'male',label:'Changed label'}]}]} as unknown as LaunchCatalog;
 const html=renderToStaticMarkup(h(LaunchIntakeDetails,{enrollment:e,catalog}));assert.doesNotMatch(html,/Changed prompt|Changed label/);assert.match(html,/wording unavailable/i);
});
test('reassignment denial and revision conflicts retire protected identity bytes',async()=>{
 const revoked:string[]=[];const images=new ProtectedIdentityImages(async()=>({idPhoto:{url:'https://example.invalid/i',expiresAt:'2099-01-01'},selfie:{url:'https://example.invalid/s',expiresAt:'2099-01-01'}}),async()=>new Response(new Blob(['synthetic'])),{createObjectURL:()=>`blob:${Math.random()}`,revokeObjectURL:x=>revoked.push(x)});
 for(const status of [403,404,409]){await images.load();assert.equal(images.reviewFailure({status}),status===409?'conflict':'denied');assert.equal(images.snapshot().data,null);}assert.equal(revoked.length,6);
});
test('pending clinician review publications remain visibly DRAFT',()=>{
 const e=enrollment();e.case.questionnaireVersion='1.0-pending-review';
 assert.match(renderToStaticMarkup(h(LaunchIntakeDetails,{enrollment:e,catalog:null})),/DRAFT clinical content/);
});
