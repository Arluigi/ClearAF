'use client';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUnsaved } from '@/components/care-support/shared';
import { useClinicalAPI } from '@/lib/auth';
import { IdempotentAction, hasLaunchCareAccess } from '@/lib/care-decisions';
import type { PrescriptionSentBody } from '@/lib/launch';
import type { LaunchChart, LaunchPharmacy, LaunchPrescriptionSent } from '@/types/api';
export type PrescriptionDraft=PrescriptionSentBody&{confirmed:boolean;pharmacyConfirmed:boolean};
const EMPTY_PHARMACY:LaunchPharmacy={name:'',addressLine1:'',addressLine2:null,city:'',state:'',postalCode:'',phone:''};
export function prescriptionBody(draft:PrescriptionDraft,now=Date.now()):PrescriptionSentBody {
  if(!draft.confirmed)throw new Error('Confirm that this prescription was already sent outside UNZIT in TreatRx.');
  if(!draft.pharmacyConfirmed)throw new Error('Confirm the full pharmacy snapshot.');
  for(const key of ['drug','strength','sig'] as const)if(!draft[key].trim())throw new Error('Drug, strength and directions are required.');
  for(const key of ['name','addressLine1','city','state','postalCode','phone'] as const)if(!draft.pharmacy[key].trim())throw new Error('The full pharmacy name, address and phone are required.');
  const time=new Date(draft.sentAt).getTime();if(!Number.isFinite(time))throw new Error('A valid date and time sent is required.');if(time>now)throw new Error('Date sent cannot be in the future.');
  return {drug:draft.drug.trim(),strength:draft.strength.trim(),sig:draft.sig.trim(),sentAt:new Date(time).toISOString(),pharmacy:{...draft.pharmacy,name:draft.pharmacy.name.trim(),addressLine1:draft.pharmacy.addressLine1.trim(),addressLine2:draft.pharmacy.addressLine2?.trim()||null,city:draft.pharmacy.city.trim(),state:draft.pharmacy.state.trim().toUpperCase(),postalCode:draft.pharmacy.postalCode.trim(),phone:draft.pharmacy.phone.trim()}};
}
export function prescriptionBlock(chart:LaunchChart,now=Date.now()):string|null {
  const record=chart.enrollment.case,membership=chart.enrollment.membership;
  if(record.identity?.status!=='approved')return 'Server-approved manual identity review is required.';
  if(record.status!=='approved')return 'Clinical case approval is required.';
  if(!hasLaunchCareAccess(membership,now))return 'Current paid care access is required.';
  if(membership?.destinationRequired||!record.destination||record.destination.planId!==membership?.planId)return 'A current destination matching the membership plan is required.';
  const latest=[...chart.checkIns.data].filter(row=>row.submittedAt&&row.answers).sort((a,b)=>Date.parse(b.submittedAt!)-Date.parse(a.submittedAt!))[0];
  if(!record.identity.attestedInNC||latest?.answers?.physicallyInNC===false)return 'Current affirmative NC attestation is required. The server confirms freshness.';
  return null;
}
export function PrescriptionDraftControls({dirty,pending,onDiscard}:{dirty:boolean;pending:boolean;onDiscard:()=>void}) {
  return dirty?<Button type="button" variant="outline" disabled={pending} onClick={()=>{if(!pending)onDiscard();}}>Discard unsaved prescription</Button>:null;
}
export default function PrescriptionSentForm({patientId,chart,onSaved,onDenied,onPendingChange}:{patientId:string;chart:LaunchChart;onSaved:(record:LaunchPrescriptionSent)=>void;onDenied:()=>void;onPendingChange:(pending:boolean)=>void}) {
  const api=useClinicalAPI();const destination=chart.enrollment.case.destination;
  const [draft,setDraft]=useState<PrescriptionDraft>(()=>({drug:'',strength:'',sig:'',sentAt:'',pharmacy:destination?.planId==='care'?{...destination.pharmacy}:{...EMPTY_PHARMACY},confirmed:false,pharmacyConfirmed:false}));
  const [dirty,setDirty]=useState(false);const [error,setError]=useState('');const [denied,setDenied]=useState(false);
  const callbacks=useRef({onSaved,onDenied});callbacks.current={onSaved,onDenied};
  const action=useMemo(()=>new IdempotentAction<PrescriptionSentBody,{prescription:LaunchPrescriptionSent}>(async(id,body)=>{try{return await api.launch().prescription(patientId,id,body);}catch(error){if(typeof error==='object'&&error!==null&&'status' in error&&[401,403,404].includes(Number(error.status))){setDenied(true);callbacks.current.onDenied();}if(error instanceof Error)setError(error.message);throw error;}}),[api,patientId]);
  const state=useSyncExternalStore(action.subscribe,action.snapshot,action.snapshot);
  useEffect(()=>{onPendingChange(dirty||action.frozenBody!==null||state.status==='saving');},[dirty,state.status,action,onPendingChange]);
  useEffect(()=>()=>action.cancel(),[action]);useUnsaved(dirty&&state.status!=='saved');
  const block=prescriptionBlock(chart);const frozen=action.frozenBody!==null;const busy=state.status==='saving';
  const edit=(key:'drug'|'strength'|'sig'|'sentAt',value:string)=>{setDraft({...draft,[key]:value});setDirty(true);};
  return <form aria-label="Record prescription already sent" className="space-y-4" onSubmit={event=>{event.preventDefault();setError('');try{const body=action.frozenBody??prescriptionBody(draft);void action.submit(body).then(result=>{if(result==='saved'&&action.snapshot().result){setDirty(false);callbacks.current.onSaved(action.snapshot().result!.prescription);}});}catch(error){setError(error instanceof Error?error.message:'Review required fields.');}}}>
    <p className="text-sm">Record a prescription already sent outside UNZIT in TreatRx. This saves a chart record.</p>
    {block&&<p role="alert" className="text-sm">{block}</p>}
    <fieldset disabled={!!block||frozen||denied||state.status==='saved'} className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">Prescription details</legend>
      <label className="text-sm">Drug<Input required maxLength={200} value={draft.drug} onChange={e=>edit('drug',e.target.value)}/></label>
      <label className="text-sm">Strength<Input required maxLength={100} value={draft.strength} onChange={e=>edit('strength',e.target.value)}/></label>
      <label className="text-sm sm:col-span-2">Directions / sig<Textarea required maxLength={2000} value={draft.sig} onChange={e=>edit('sig',e.target.value)}/></label>
      <label className="text-sm">Date and time sent (your local time)<Input required type="datetime-local" value={draft.sentAt} onChange={e=>edit('sentAt',e.target.value)}/></label>
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">Full pharmacy snapshot</legend>
        {([['name','Pharmacy name'],['addressLine1','Street address'],['addressLine2','Address line 2 (optional)'],['city','City'],['state','State'],['postalCode','ZIP code'],['phone','Phone']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<Input required={key!=='addressLine2'} maxLength={key==='state'?2:200} type={key==='phone'?'tel':'text'} value={draft.pharmacy[key]??''} onChange={e=>{setDirty(true);setDraft({...draft,pharmacyConfirmed:false,pharmacy:{...draft.pharmacy,[key]:e.target.value}});}}/></label>)}
      </fieldset>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" required checked={draft.pharmacyConfirmed} onChange={e=>{setDirty(true);setDraft({...draft,pharmacyConfirmed:e.target.checked});}}/>I confirmed the full pharmacy snapshot against the prescription sent. Later destination changes do not change this record.</label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" required checked={draft.confirmed} onChange={e=>{setDirty(true);setDraft({...draft,confirmed:e.target.checked});}}/>I confirm this prescription was already sent outside UNZIT in TreatRx.</label>
    </fieldset>
    <p role="status" className="text-sm text-ink-secondary">{state.status==='saved'?'Recorded in the patient chart':frozen?'Save not confirmed; retry preserves the same record and pharmacy snapshot':dirty?'Unsaved prescription record':'No unsaved prescription record'}</p>
    {(error||state.error)&&<p role="alert" className="text-sm">{error||state.error}</p>}
    <PrescriptionDraftControls dirty={dirty} pending={frozen||busy} onDiscard={()=>{setDraft({drug:'',strength:'',sig:'',sentAt:'',pharmacy:destination?.planId==='care'?{...destination.pharmacy}:{...EMPTY_PHARMACY},confirmed:false,pharmacyConfirmed:false});setDirty(false);setError('');action.reset();}}/>
    <Button variant="outline" type="submit" disabled={!!block||busy||denied||state.status==='saved'}>{busy?'Saving record…':frozen?'Retry same prescription record':'Save already-sent prescription record'}</Button>
  </form>;
}
