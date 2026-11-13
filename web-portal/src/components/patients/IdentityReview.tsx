/* eslint-disable @next/next/no-img-element -- Private identity bytes must never enter the image optimizer cache. */
'use client';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useClinicalAPI } from '@/lib/auth';
import { IdempotentAction } from '@/lib/care-decisions';
import type { LaunchReviewBody, LaunchReviewResult } from '@/lib/launch';
import type { LaunchIdentity, LaunchSignedImage } from '@/types/api';
type Pair={idPhoto:LaunchSignedImage;selfie:LaunchSignedImage};
type ImagesState={status:'idle'|'loading'|'ready'|'error';data:{idPhoto:string;selfie:string;expiresAt:number}|null};
/** Owns transient bytes; authorization is rechecked on each refresh. Never stores signed links. */
export class ProtectedIdentityImages {
  private state:ImagesState={status:'idle',data:null};private listeners=new Set<()=>void>();private generation=0;private abort?:AbortController;
  constructor(private authorize:(signal?:AbortSignal)=>Promise<Pair>,private fetchBytes:typeof fetch=fetch,private urls:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>=URL,private now=()=>Date.now()){}
  snapshot=()=>this.state;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
  private publish(state:ImagesState){this.state=state;this.listeners.forEach(fn=>fn());}
  dispose(){this.generation++;this.abort?.abort();if(this.state.data){this.urls.revokeObjectURL(this.state.data.idPhoto);this.urls.revokeObjectURL(this.state.data.selfie);}this.publish({status:'idle',data:null});}
  reviewFailure(error:unknown){
    const status=typeof error==='object'&&error!==null&&'status' in error?error.status:null;
    if(status===401||status===403||status===404||status===409)this.dispose();
    return status===409?'conflict':status===401||status===403||status===404?'denied':'retry';
  }
  async load(){
    this.dispose();const generation=this.generation;const abort=new AbortController();this.abort=abort;this.publish({status:'loading',data:null});
    try {
      const pair=await this.authorize(abort.signal);if(generation!==this.generation)return;
      const expiresAt=Math.min(Date.parse(pair.idPhoto.expiresAt),Date.parse(pair.selfie.expiresAt));
      if(!Number.isFinite(expiresAt)||expiresAt<=this.now())throw new Error('Expired');
      // Browser fetch rejects the image owner as its receiver. Invoke it as a function.
      const fetchBytes=this.fetchBytes;
      const blobs=await Promise.all([pair.idPhoto,pair.selfie].map(async image=>{const response=await fetchBytes(image.url,{signal:abort.signal,cache:'no-store',referrerPolicy:'no-referrer',credentials:'omit'});if(!response.ok)throw new Error('Unavailable');return response.blob();}));
      if(generation!==this.generation||abort.signal.aborted)return;
      if(expiresAt<=this.now())throw new Error('Expired during transfer');
      this.publish({status:'ready',data:{idPhoto:this.urls.createObjectURL(blobs[0]),selfie:this.urls.createObjectURL(blobs[1]),expiresAt}});
    }catch{if(generation===this.generation)this.publish({status:'error',data:null});}
  }
}
export default function IdentityReview({patientId,identity,revision,onChanged,active=true}:{patientId:string;identity:LaunchIdentity|null;revision:number;onChanged:()=>void;active?:boolean}) {
  const changed=useRef(onChanged);changed.current=onChanged;
  const api=useClinicalAPI();const [open,setOpen]=useState(false);const [confirmed,setConfirmed]=useState(false);const [message,setMessage]=useState('');const [conflict,setConflict]=useState(false);
  const images=useMemo(()=>new ProtectedIdentityImages(signal=>api.launch().images(patientId,identity!.id,signal)),[api,patientId,identity?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const state=useSyncExternalStore(images.subscribe,images.snapshot,images.snapshot);
  const action=useMemo(()=>new IdempotentAction<LaunchReviewBody,LaunchReviewResult>(async(id,body)=>{try{return await api.launch().review(patientId,id,body);}catch(error){const failure=images.reviewFailure(error);if(failure!=='retry'){setConflict(true);setOpen(false);setConfirmed(false);if(failure==='denied')changed.current();}throw error;}}),[api,patientId,images]);
  const save=useSyncExternalStore(action.subscribe,action.snapshot,action.snapshot);
  useEffect(()=>()=>{images.dispose();action.cancel();},[images,action]);
  useEffect(()=>{if(!active){images.dispose();setOpen(false);setConfirmed(false);}},[active,images]);
  useEffect(()=>{setConflict(false);setConfirmed(false);setMessage('');},[revision]);
  useEffect(()=>{if(!open||!state.data)return;const timer=setTimeout(()=>void images.load(),Math.max(1000,state.data.expiresAt-Date.now()-15000));return()=>clearTimeout(timer);},[open,state.data,images]);
  if(!identity)return <p>Identity package missing.</p>;
  const submit=async(outcome:LaunchReviewBody['outcome'])=>{const result=await action.submit({targetType:'identity',targetId:identity.id,expectedRevision:revision,outcome,patientMessage:message.trim()||null});if(result==='saved'){images.dispose();setOpen(false);setConfirmed(false);changed.current();}else if(result==='cancelled'){changed.current();}};
  const frozen=action.frozenBody!==null;const busy=save.status==='saving';
  return <section aria-label="Manual identity review" className="space-y-3 border-t border-rule pt-4">
    <h3 className="font-medium">Identity · {identity.status.replaceAll('_',' ')}</h3><p className="text-sm">Claimed name: {identity.fullName} · Date of birth: {identity.dateOfBirth}</p><p className="meta-mono">NC attestation: {identity.attestedInNC?'Yes':'No'} · {identity.attestedAt}</p>
    <Button variant="outline" onClick={()=>{if(open){images.dispose();setOpen(false);setConfirmed(false);}else{setOpen(true);void images.load();}}}>{open?'Close ID and selfie':'Open ID and selfie'}</Button>
    {open&&<div className="space-y-3">{state.status==='loading'&&<p role="status">Loading protected identity images</p>}{state.status==='error'&&<p role="alert">Images unavailable. Reopen or refresh to recheck access.</p>}
      {state.data&&<div className="grid gap-3 sm:grid-cols-2">{(['idPhoto','selfie'] as const).map(key=><figure key={key}><div className="photo-mat overflow-auto"><img className="max-h-[32rem] w-full object-contain" src={state.data![key]} referrerPolicy="no-referrer" alt={key==='idPhoto'?'Submitted identity document':'Submitted selfie'} onError={()=>images.dispose()}/></div><figcaption className="text-sm">{key==='idPhoto'?'Identity document':'Selfie'}</figcaption></figure>)}</div>}
      <Button variant="outline" onClick={()=>{setConfirmed(false);void images.load();}}>Refresh protected images</Button>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={!state.data||frozen} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I manually compared the ID and selfie, matched the claimed name and date of birth, and confirmed age 18 or older.</label>
    </div>}
    <label className="block text-sm">Message to patient (required for corrections or rejection)<Textarea maxLength={2000} value={message} disabled={frozen} onChange={e=>setMessage(e.target.value)}/></label>
    {conflict?<div role="alert"><p>The record changed. Reload and review the latest package before deciding.</p><Button variant="outline" onClick={onChanged}>Reload for re-review</Button></div>:<div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy||!confirmed||!state.data||!identity.attestedInNC||frozen} onClick={()=>void submit('approve')}>Approve manual identity match</Button>
      <Button variant="outline" disabled={busy||!message.trim()||frozen} onClick={()=>void submit('needs_changes')}>Request identity corrections</Button>
      <Button variant="outline" disabled={busy||!message.trim()||frozen} onClick={()=>void submit('reject')}>Reject identity and refund in full</Button>
      {frozen&&!busy&&<Button variant="outline" onClick={()=>void action.submit(action.frozenBody!).then(result=>{if(result==='saved')onChanged();})}>Retry same identity review</Button>}
    </div>}
    {save.status==='error'&&<p role="alert">{save.error}</p>}
  </section>;
}
