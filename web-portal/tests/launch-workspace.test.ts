import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { apiService, authStorage, supabase } from '../src/lib/api';
import { IdempotentAction, readLaunchChart } from '../src/lib/care-decisions';
import { ProtectedIdentityImages } from '../src/components/patients/IdentityReview';
import { LaunchIntakeDetails } from '../src/components/patients/LaunchIntakeReview';
import { launchReviewHref } from '../src/lib/patient-navigation';
import { workspaceHref } from '../src/lib/workspace';
import type { LaunchEnrollmentResponse, LaunchQueueItem } from '../src/types/api';

// Live API acceptance remains a handoff: identity/case/check-in/correction review,
// external TreatRx record, refund pending/failed/issued, assignment denial,
// keyboard focus/dialog return and narrow layout. No live backend is available here.
test('identity bytes that expire during transfer never become visible',async()=>{
 let now=0,created=0;
 const images=new ProtectedIdentityImages(async()=>({idPhoto:{url:'https://example.invalid/i',expiresAt:new Date(1000).toISOString()},selfie:{url:'https://example.invalid/s',expiresAt:new Date(1000).toISOString()}}),async()=>{now=2000;return new Response(new Blob(['synthetic']));},{createObjectURL:()=>{created++;return 'blob:test';},revokeObjectURL:()=>{}},()=>now);
 await images.load();assert.equal(images.snapshot().status,'error');assert.equal(created,0);
});
test('published clinical versions replace DRAFT labeling without a client release',()=>{
 const enrollment={case:{questionnaireVersion:'1.0',medicalHistory:{},eligibility:null,flags:[],destination:null,identity:null,status:'medical_history',submittedAt:null},consents:[],membership:null} as unknown as LaunchEnrollmentResponse;
 const html=renderToStaticMarkup(h(LaunchIntakeDetails,{enrollment,catalog:null}));assert.doesNotMatch(html,/DRAFT clinical content/);assert.match(html,/Clinical content/);
});
test('ID, intake, check-in, prescription, photo and messaging navigation remains in the patient workspace',()=>{
 for(const kind of ['identity','enrollment','check_in'] as const){const href=launchReviewHref({patientId:'p',targetId:'opaque',kind} as LaunchQueueItem,'page=3&filter=flagged');const query=new URLSearchParams(href.split('?')[1]);assert.equal(query.get('reviewTarget'),'opaque');assert.equal(query.get('page'),'3');assert.equal(query.get('tab'),kind==='check_in'?'check-ins':null);}
 for(const tab of ['routine','photos','messages'] as const)assert.match(workspaceHref('p','page=3&filter=flagged',tab),/^\/patients\/p\?/);
});
test('reassignment and session changes deny every launch mutation/read, with no legacy refund request',async()=>{
 await new Promise<void>(resolve=>setImmediate(resolve));const oldSession=supabase.auth.getSession,oldFetch=globalThis.fetch;
 const session={access_token:'synthetic',user:{id:'clinician-a'}};authStorage.beginLogin();apiService.acceptSession(session);supabase.auth.getSession=async()=>({data:{session},error:null}) as Awaited<ReturnType<typeof oldSession>>;
 const paths:string[]=[];globalThis.fetch=async(input)=>{paths.push(new URL(String(input)).pathname);return new Response(JSON.stringify({error:'Current assignment required',code:'INSUFFICIENT_PERMISSIONS'}),{status:403});};
 try{
  const api=apiService.scoped().launch();const review=new IdempotentAction((id,body:{targetType:'case';targetId:string;expectedRevision:number;outcome:'reject';patientMessage:string})=>api.review('p',id,body),()=> 'review-id');
  await review.submit({targetType:'case',targetId:'case',expectedRevision:1,outcome:'reject',patientMessage:'Synthetic rejection'});assert.equal(review.snapshot().status,'error');assert.equal(review.snapshot().result,null);
  await assert.rejects(readLaunchChart(()=>api.chart('p')),{status:403});await assert.rejects(api.images('p','identity'),{status:403});await assert.rejects(api.prescription('p','record',{drug:'Synthetic',strength:'1%',sig:'Synthetic',pharmacy:{name:'Synthetic',addressLine1:'1 Test Way',addressLine2:null,city:'Raleigh',state:'NC',postalCode:'27601',phone:'5550100100'},sentAt:'2026-11-09T12:00:00Z'}),{status:403});
  assert.equal(paths.length,4);assert.ok(paths.every(path=>path.startsWith('/api/launch/')));assert.ok(paths.every(path=>!path.includes('/refund')));
  apiService.acceptSession({access_token:'other',user:{id:'clinician-b'}});assert.throws(()=>api.chart('p'));assert.equal(paths.length,4);
 }finally{supabase.auth.getSession=oldSession;globalThis.fetch=oldFetch;}
});
test('an invalid session revokes already-open identity bytes before offering another action',async()=>{
 const revoked:string[]=[];const images=new ProtectedIdentityImages(async()=>({idPhoto:{url:'https://example.invalid/i',expiresAt:'2099-01-01'},selfie:{url:'https://example.invalid/s',expiresAt:'2099-01-01'}}),async()=>new Response(new Blob(['synthetic'])),{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:url=>revoked.push(url)});
 await images.load();assert.equal(images.reviewFailure({status:401}),'denied');assert.equal(images.snapshot().data,null);assert.equal(revoked.length,2);
});
test('discarding a prescription draft is available without discarding an ambiguous save attempt',async()=>{
 const {PrescriptionDraftControls}=await import('../src/components/patients/PrescriptionSentForm');
 const draft=renderToStaticMarkup(h(PrescriptionDraftControls,{dirty:true,pending:false,onDiscard:()=>{}}));assert.match(draft,/>Discard unsaved prescription</);assert.doesNotMatch(draft,/disabled=""/);
 const frozen=renderToStaticMarkup(h(PrescriptionDraftControls,{dirty:true,pending:true,onDiscard:()=>{}}));assert.match(frozen,/disabled=""/);
});
