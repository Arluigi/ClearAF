import './env';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EnrollmentFlowStatus} from '../src/components/patients/EnrollmentFlowStatus';
import {launchApprovalBlock} from '../src/lib/workspace';
import type {LaunchEnrollmentResponse} from '../src/types/api';
const enrollment={case:{status:'medical_history',questionnaireVersion:'2.2-pending-review',revision:4,identity:null,enrollmentProgress:{step:'medical_history',topicId:'medicines'}},membership:{status:'paid_pending_review'},consents:[]} as unknown as LaunchEnrollmentResponse;
test('paid unfinished enrollment shows the saved topic and keeps identity approval mandatory',()=>{
 const html=renderToStaticMarkup(h(EnrollmentFlowStatus,{enrollment}));
 assert.match(html,/Enrollment in progress/);assert.match(html,/Medicines/);
 assert.match(html,/Payment received/);assert.match(html,/Identity has not been submitted/);
 assert.equal(launchApprovalBlock(enrollment),'Manual identity approval is required.');
 assert.doesNotMatch(html,/Ready for clinical review|Care active/);
});
test('uploaded identity can be reviewed before medical history is complete',()=>{
 const saved=structuredClone(enrollment);saved.case.identity={status:'uploaded'} as NonNullable<LaunchEnrollmentResponse['case']['identity']>;
 const html=renderToStaticMarkup(h(EnrollmentFlowStatus,{enrollment:saved}));
 assert.match(html,/Identity awaiting manual review/);
 assert.match(html,/Enrollment in progress/);
 assert.equal(launchApprovalBlock(saved),'Manual identity approval is required.');
});
test('2.2 clinical approval requires pharmacy details while historical Care behavior is preserved',()=>{
 const saved={case:{status:'submitted',questionnaireVersion:'2.2-pending-review',identity:{status:'approved',attestedInNC:true},photoSet:{requiredSlots:['front'],items:[{slot:'front'}]},destination:null,intakeV2:{},planId:'care'},consents:['telehealth','medication','privacy_notice','subscription_terms'].map(key=>({key,acceptedAt:'2026-11-10T00:00:00Z'})),membership:{status:'paid_pending_review'}} as unknown as LaunchEnrollmentResponse;
 assert.equal(launchApprovalBlock(saved),'A destination is required.');
 saved.case.questionnaireVersion='2.1-pending-review';
 assert.equal(launchApprovalBlock(saved),null);
});
