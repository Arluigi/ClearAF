'use client';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useClinicalAPI } from '@/lib/auth';
import { launchReviewHref, launchWaiting } from '@/lib/patient-navigation';
import { useRead, LoadState, Pages } from '@/components/care-support/shared';
import { Button } from '@/components/ui/button';
import { readLaunchQueue } from '@/lib/launch';
import type { LaunchQueueItem } from '@/types/api';
const LABEL = {identity:'Identity',enrollment:'Enrollment',check_in:'Check-in'};
export function LaunchQueueRows({items,context,now}:{items:LaunchQueueItem[];context:string;now:Date}) {
  if (!items.length) return <p className="py-4 text-sm text-ink-secondary">No launch reviews waiting.</p>;
  return <ul className="divide-y divide-rule">{items.map(item=><li key={item.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
    <a className="text-sm underline underline-offset-4" href={launchReviewHref(item,context)}>{LABEL[item.kind]} · {item.patientName || 'Unnamed patient'}</a>
    <span className="meta-mono">{launchWaiting(item.receivedAt,now)}</span>
  </li>)}</ul>;
}
export default function LaunchReviewQueue({context}:{context:string}) {
  const api=useClinicalAPI();
  const [kind,setKind]=useState<LaunchQueueItem['kind']|''>('');const [page,setPage]=useState(1);
  const fetch=useCallback(()=>readLaunchQueue(next=>api.launch().queue(kind||undefined,next),page),[api,kind,page]);const result=useRead(fetch);
  useEffect(()=>{if(result.data)setPage(result.data.pagination.page);},[result.data]);
  return <section aria-label="Launch review queue" className="space-y-3 border-t-2 border-ink pt-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="editorial-title text-2xl">Enrollment and check-in reviews</h2><p className="text-sm text-ink-secondary">Review within 1 to 2 business days. Oldest received first.</p></div><Button variant="outline" onClick={result.retry}>Refresh reviews</Button></div>
    <label className="block text-sm">Review kind <select className="ml-2 border-b border-ink bg-transparent py-2" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setPage(1);}}><option value="">All reviews</option>{Object.entries(LABEL).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <LoadState {...result} loading="Loading launch reviews" />
    {result.data && <><LaunchQueueRows items={result.data.data} context={context} now={new Date()} /><Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} /></>}
  </section>;
}
