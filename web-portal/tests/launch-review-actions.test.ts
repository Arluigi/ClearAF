import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdempotentAction, launchMembershipWords, launchReviewBlock, readLaunchChart } from '../src/lib/care-decisions';
import { LaunchCheckInView } from '../src/components/care-support/CheckInViews';
import { LaunchMembershipStatus } from '../src/components/patients/CareStatusCard';
import type { LaunchCheckIn, LaunchEnrollmentResponse, LaunchMembership } from '../src/types/api';
const membership=(status:LaunchMembership['status'],refundStatus:LaunchMembership['refundStatus']='not_applicable'):LaunchMembership=>({id:'m',planId:'care',status,refundStatus,amountCents:3900,currency:'usd',activatedAt:null,currentPeriodEnd:null,paidThrough:null,cancelAtPeriodEnd:false,cadenceAnchor:null,access:status==='active'?'care':'enrollment'});
const checkIn=(status:LaunchCheckIn['status']):LaunchCheckIn=>({id:'ci',dueAt:'2026-12-09T12:00:00Z',cadenceAnchor:'2026-11-09T12:00:00Z',kind:'monthly',status,formId:'f',form:{id:'f',userId:'p',version:1,createdBy:'c',createdAt:'2026-11-09T12:00:00Z',title:'DRAFT follow-up',isActive:true,questions:[]},responseId:'r',photoSet:{id:'set',purpose:'check_in',status:'submitted',requiredSlots:['front'],items:[{slot:'front',photoId:'photo',captureId:'capture'}]},answers:{tolerability:'some_irritation',sideEffects:{none:false,details:'Synthetic side effect'},pregnancyStatus:'pregnant',newMedicines:{none:false,details:'Synthetic medicine'},physicallyInNC:false},submittedAt:'2026-12-09T12:00:00Z',reviewedAt:null,patientMessage:'Prior correction'});
test('all check-in states retain factual answers, flags and prior patient message; only submitted reviews enabled',()=>{
 for(const status of ['due','draft','submitted','needs_changes','reviewed','superseded'] as const){const ci=checkIn(status);const html=renderToStaticMarkup(h(LaunchCheckInView,{checkIn:ci,photos:null,actions:null}));assert.match(html,new RegExp(status.replace('_',' ')));assert.match(html,/pregnant/);assert.match(html,/Synthetic side effect/);assert.match(html,/Prior correction/);assert.match(html,/NC: No/);assert.equal(launchReviewBlock({} as LaunchEnrollmentResponse,ci)!==null,true);}
 const ci=checkIn('submitted');ci.answers!.physicallyInNC=true;assert.equal(launchReviewBlock({} as LaunchEnrollmentResponse,ci),null);ci.photoSet=null;assert.match(launchReviewBlock({} as LaunchEnrollmentResponse,ci)!,/photo/i);
});
test('approval and care activation are separate; provider refund states never offer manual issue',()=>{
 assert.match(launchMembershipWords(membership('paid_pending_review'),'approved'),/not yet confirmed active/i);assert.match(launchMembershipWords(membership('active'),'approved'),/Care active/);
 for(const refund of ['pending','failed','issued'] as const){const html=renderToStaticMarkup(h(LaunchMembershipStatus,{membership:membership('rejected',refund),caseStatus:'rejected'}));assert.match(html,new RegExp(`Refund ${refund}`));assert.doesNotMatch(html,/Mark refund|markRefundIssued/);}
});
test('launch probe fails closed on ambiguous not-found, reassignment and network failures',async()=>{
 for(const status of [401,403,404,409,503])await assert.rejects(readLaunchChart(async()=>{throw {status};}));
});
test('review duplicate click, transport retry and concurrent revision preserve one frozen client ID',async()=>{
 let release!:(x:unknown)=>void;const calls:unknown[]=[];let fail=true;const action=new IdempotentAction(async(id,body)=>{calls.push([id,body]);if(fail)throw {status:409,code:'REVISION_CONFLICT'};return new Promise(resolve=>{release=resolve;});},()=> 'review-id');
 await action.submit({expectedRevision:2,outcome:'reject'});assert.equal(action.snapshot().result,null);fail=false;const pending=action.submit({expectedRevision:99,outcome:'approve'});assert.equal(await action.submit({expectedRevision:99,outcome:'approve'}),'busy');release({review:{outcome:'reject'}});await pending;assert.deepEqual(calls,[['review-id',{expectedRevision:2,outcome:'reject'}],['review-id',{expectedRevision:2,outcome:'reject'}]]);
});
