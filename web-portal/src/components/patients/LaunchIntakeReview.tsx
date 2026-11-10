'use client';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { readLaunchChart } from '@/lib/care-decisions';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { Button } from '@/components/ui/button';
import { consentReceipts, intakeAnswer, launchApprovalBlock } from '@/lib/workspace';
import type { LaunchCatalog, LaunchEnrollmentResponse, LaunchQuestion } from '@/types/api';
import { LaunchClinicalReview } from './CareDecisionDialog';
import { LaunchMembershipStatus } from './CareStatusCard';
import IdentityReview from './IdentityReview';

function answer(value:unknown,question?:LaunchQuestion):string {
  if(typeof value==='string')return question?.options.find(option=>option.id===value)?.label??intakeAnswer(value);
  if(Array.isArray(value))return value.map(item=>answer(item,question)).join(', ')||'None selected';
  if(value&&typeof value==='object')return Object.entries(value).map(([key,field])=>`${question?.fields.find(q=>q.id===key)?.prompt??key}: ${answer(field,question?.fields.find(q=>q.id===key))}`).join('; ');
  return intakeAnswer(value);
}
export function LaunchIntakeDetails({enrollment,catalog}:{enrollment:LaunchEnrollmentResponse;catalog:LaunchCatalog|null}) {
  const record=enrollment.case;
  const keys=[...Array.from({length:22},(_,i)=>`M${i+1}`),'medicationPreference'];
  return <div className="space-y-5">
    <p className="text-sm">{record.questionnaireVersion.includes('draft')?'DRAFT clinical content':'Clinical content'} · {record.questionnaireVersion}. Flags require clinician review.</p>
    <ul className="divide-y divide-rule">{consentReceipts(enrollment.consents).map(receipt=><li className="break-words py-2 text-sm" key={receipt.key}>{receipt.text}</li>)}</ul>
    <section aria-label="Eligibility and clinical flags"><h3 className="font-medium">Eligibility and flags</h3><p className="whitespace-pre-wrap break-words text-sm">{intakeAnswer(record.eligibility?.answers)} · {[...record.flags,...record.eligibility?.flags??[]].join(', ')||'No flags recorded'}</p></section>
    <dl className="divide-y divide-rule">{keys.map(key=>{const question=(catalog?.questionnaireVersion===record.questionnaireVersion?catalog:null)?.medicalQuestions.find(q=>q.id===key);const value=record.medicalHistory[key as keyof typeof record.medicalHistory];return <div key={key} className="grid gap-2 py-3 sm:grid-cols-2"><dt className="text-sm text-ink-secondary">{key} · {question?.prompt??'Question wording unavailable'}</dt><dd className="whitespace-pre-wrap break-words text-sm">{answer(value,question)}</dd></div>;})}</dl>
    <section aria-label="Care destination"><h3 className="font-medium">Destination</h3><p className="whitespace-pre-wrap break-words text-sm">{intakeAnswer(record.destination)}</p></section>
    <p className="meta-mono">Submitted: {record.submittedAt||'Not submitted'} · Case {record.status.replaceAll('_',' ')}</p>
    <p className="text-sm">{launchApprovalBlock(enrollment)??'Manual identity approved. Submitted package is ready for clinical review.'}</p>
  </div>;
}
export default function LaunchIntakeReview({patientId,targetId,kind,active=true}:{patientId:string;targetId?:string|null;kind?:string|null;active?:boolean}) {
  const api=useClinicalAPI();const [page,setPage]=useState(1);const section=useRef<HTMLElement>(null);
  const fetch=useCallback(()=>readLaunchChart(()=>api.launch().chart(patientId,page)),[api,patientId,page]);const chart=useRead(fetch);
  const fetchCatalog=useCallback(()=>api.launch().catalog(),[api]);const catalog=useRead(fetchCatalog);
  useEffect(()=>{if(kind==='identity'||kind==='enrollment')section.current?.scrollIntoView({block:'start'});},[kind,targetId]);
  return <section ref={section} aria-label="Enrollment review" className="space-y-5 border-t-2 border-ink pt-5">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="editorial-title text-2xl">Enrollment review</h2><Button variant="outline" onClick={chart.retry}>Refresh enrollment</Button></div>
    <p className="text-sm text-ink-secondary">Review within 1 to 2 business days. Compare the submitted skin photos below as part of clinical review.</p>
    <LoadState {...chart} loading="Loading enrollment chart"/><LoadState {...catalog} loading="Loading versioned question wording"/>
    {chart.data&&<><IdentityReview key={`${patientId}-${chart.data.enrollment.case.revision}`} active={active} patientId={patientId} identity={chart.data.enrollment.case.identity} revision={chart.data.enrollment.case.revision} onChanged={chart.retry}/><LaunchIntakeDetails enrollment={chart.data.enrollment} catalog={catalog.data}/><LaunchClinicalReview patientId={patientId} enrollment={chart.data.enrollment} onChanged={chart.retry}/><LaunchMembershipStatus membership={chart.data.enrollment.membership} caseStatus={chart.data.enrollment.case.status}/>
      {targetId&&kind==='enrollment'&&targetId!==chart.data.enrollment.case.id&&<p role="alert">This review target is unavailable. Refresh the worklist.</p>}
      <details><summary className="cursor-pointer text-sm">Prior review decisions</summary><ul className="divide-y divide-rule">{chart.data.reviews.data.map(review=><li className="break-words py-2 text-sm" key={review.id}>{review.targetType} · {review.outcome.replaceAll('_',' ')} · {review.createdAt}{review.patientMessage&&<p className="whitespace-pre-wrap">{review.patientMessage}</p>}</li>)}</ul><Pages page={page} totalPages={chart.data.reviews.pagination.totalPages} onPage={setPage}/></details>
    </>}
  </section>;
}
