'use client';
import * as React from 'react';
import { useCallback, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { readLaunchChart } from '@/lib/care-decisions';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { Button } from '@/components/ui/button';
import { stamp } from '@/lib/worklist';
import type { LaunchPrescriptionSent } from '@/types/api';
import PrescriptionSentForm from './PrescriptionSentForm';
type LegacyPrescription={id:string;medicationName:string;dosage:string;instructions:string;pharmacy:string;prescribedDate:string};
export function PrescriptionSentRows({records}:{records:(LaunchPrescriptionSent|LegacyPrescription)[]}) {
  if(!records.length)return <p className="text-sm text-ink-secondary">No prescription-sent records on this page.</p>;
  return <ul className="divide-y divide-rule">{records.map(record=>{
    const launch='source' in record&&record.source==='treatrx_external';
    return <li key={record.id} className="space-y-2 break-words py-4"><h3 className="font-medium">{launch?`${record.drug} · ${record.strength}`:`${(record as LegacyPrescription).medicationName} · ${(record as LegacyPrescription).dosage}`}</h3><p className="whitespace-pre-wrap text-sm">{launch?record.sig:(record as LegacyPrescription).instructions}</p>
      <p className="text-sm">{launch?[record.pharmacy.name,record.pharmacy.addressLine1,record.pharmacy.addressLine2,record.pharmacy.city,record.pharmacy.state,record.pharmacy.postalCode,record.pharmacy.phone].filter(Boolean).join(', '):(record as LegacyPrescription).pharmacy}</p>
      <p className="meta-mono">{launch?`Already sent in TreatRx · ${stamp(record.sentAt)} · Recorded ${stamp(record.recordedAt)}`:'Sent time not recorded · Legacy prescription'}</p></li>;
  })}</ul>;
}
export function PrescriptionRecordControls({locked,page,totalPages,onRefresh,onPage}:{locked:boolean;page:number;totalPages:number;onRefresh:()=>void;onPage:(page:number)=>void}) {
  return <div className="space-y-2"><fieldset disabled={locked} className="space-y-3"><legend className="sr-only">Prescription record navigation</legend><Button variant="outline" onClick={()=>{if(!locked)onRefresh();}}>Refresh prescription records</Button><Pages page={page} totalPages={totalPages} onPage={next=>{if(!locked)onPage(next);}}/></fieldset>{locked&&<p className="text-sm text-ink-secondary">Save or resolve the open prescription record before refreshing or changing history pages.</p>}</div>;
}
export default function PrescriptionSentHistory({patientId}:{patientId:string}) {
  const api=useClinicalAPI();const [page,setPage]=useState(1);const [saved,setSaved]=useState(false);const [locked,setLocked]=useState(false);
  const fetch=useCallback(async()=>{
    if(page===1)return readLaunchChart(()=>api.launch().chart(patientId,1));
    const [history,current]=await Promise.all([readLaunchChart(()=>api.launch().chart(patientId,page)),readLaunchChart(()=>api.launch().chart(patientId,1))]);
    if(!history||!current)return null;
    return {...history,enrollment:current.enrollment,checkIns:current.checkIns};
  },[api,patientId,page]);const chart=useRead(fetch);
  return <section id="prescription-sent" aria-label="Prescription sent records" className="space-y-4 border-t-2 border-ink pt-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="editorial-title text-2xl">Prescription sent</h2></div><LoadState {...chart} loading="Loading prescription records"/>
    {chart.data&&<>{saved&&<p role="status" className="text-sm">Prescription record saved. Showing the server chart.</p>}<details><summary className="cursor-pointer py-2 text-sm font-medium">Record prescription already sent</summary><PrescriptionSentForm key={`${patientId}-${chart.data.enrollment.case.revision}`} patientId={patientId} chart={chart.data} onPendingChange={setLocked} onSaved={()=>{setLocked(false);setSaved(true);chart.retry();}} onDenied={()=>{setLocked(false);chart.retry();}}/></details><PrescriptionSentRows records={chart.data.prescriptions.data}/><PrescriptionRecordControls locked={locked} page={page} totalPages={chart.data.prescriptions.pagination.totalPages} onRefresh={chart.retry} onPage={setPage}/></>}
  </section>;
}
