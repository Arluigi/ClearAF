/* eslint-disable @next/next/no-img-element -- Authorized short-lived originals bypass optimizer caching. */
'use client';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClinicalAPI } from '@/lib/auth';
import { IdempotentAction, decisionBody, showsPatientMessage } from '@/lib/care-decisions';
import { readLaunchChart, launchReviewBlock } from '@/lib/care-decisions';
import { LoadState, useRead } from '@/components/care-support/shared';
import type { LaunchEnrollmentResponse, LaunchCheckIn, LaunchPhotoSet } from '@/types/api';
import type { LaunchReviewBody, LaunchReviewResult } from '@/lib/launch';
import type { CareDecision, DecisionBody, DecisionKind } from '@/lib/care-decisions';

const MAX_MESSAGE = 2000;

function LegacyCareDecisionDialog({
  patientId,
  photoId,
  defaultDecision,
  open,
  onOpenChange,
  onSaved,
  onSettledAfterClose,
}: {
  patientId: string;
  photoId: string | null;
  defaultDecision: DecisionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: CareDecision) => void;
  /** Called when a save that was in flight as the dialog closed settles; the server may have stored it. */
  onSettledAfterClose?: () => void;
}) {
  const api = useClinicalAPI();
  // A fresh attempt (and client id) starts each time the dialog opens.
  const action = useMemo(
    () => new IdempotentAction<DecisionBody, CareDecision>((id, body) => api.recordCareDecision(patientId, id, body)),
    [open], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const state = useSyncExternalStore(action.subscribe, action.snapshot, action.snapshot);
  const [decision, setDecision] = useState<DecisionKind>(defaultDecision);
  const [message, setMessage] = useState('');
  // Latest callback for a save that settles after close (the submit closure may be stale by then).
  const settledAfterClose = useRef(onSettledAfterClose);
  useEffect(() => {
    settledAfterClose.current = onSettledAfterClose;
  });

  useEffect(() => {
    if (open) {
      setDecision(defaultDecision);
      setMessage('');
    }
  }, [open, defaultDecision]);

  useEffect(() => {
    if (state.status === 'saved' && state.result) {
      onSaved(state.result);
      onOpenChange(false);
    }
    // onSaved/onOpenChange are provided fresh each render; only react to a completed save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.result]);

  const disabled = action.frozenBody !== null || state.status === 'saving';
  const withMessage = showsPatientMessage(decision);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) action.cancel();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Care decision</DialogTitle>
          <DialogDescription>
            Record how this case should proceed.{withMessage && ' The patient sees this on their Today screen.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            // Closing mid-save cancels this attempt; refresh once it settles so a stored decision shows.
            void action.submit(decisionBody(decision, message, photoId)).then((outcome) => {
              if (outcome === 'cancelled') settledAfterClose.current?.();
            });
          }}
        >
          <fieldset disabled={disabled} className="space-y-2">
            <legend className="eyebrow pb-1">Care decision</legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="care-decision" value="refer_out" checked={decision === 'refer_out'} onChange={() => setDecision('refer_out')} />
                Refer out
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="care-decision"
                  value="needs_in_person"
                  checked={decision === 'needs_in_person'}
                  onChange={() => setDecision('needs_in_person')}
                />
                Needs in-person care
              </label>
              {defaultDecision === 'async_care' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="care-decision"
                    value="async_care"
                    checked={decision === 'async_care'}
                    onChange={() => {
                      setDecision('async_care');
                      setMessage('');
                    }}
                  />
                  Resume online care
                </label>
              )}
            </div>
          </fieldset>
          {/* Online care shows no card in the iOS app, so there is no message to write. */}
          {withMessage && (
            <div className="space-y-1">
              <Label htmlFor="care-decision-message">Message to the patient (optional)</Label>
              <Textarea
                id="care-decision-message"
                maxLength={MAX_MESSAGE}
                disabled={disabled}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <p className="text-sm text-ink-secondary">
                {message.length}/{MAX_MESSAGE}
              </p>
              <p className="text-sm text-ink-secondary">Shown to the patient with next steps. A refund will be marked pending.</p>
            </div>
          )}
          {state.status === 'error' && <p role="alert" className="text-sm text-error">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={state.status === 'saving'}>
              {state.status === 'saving' ? 'Saving…' : action.frozenBody !== null ? 'Retry same decision' : 'Save decision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Photo decisions on launch accounts must use the complete case/check-in review. */
export default function CareDecisionDialog(props:React.ComponentProps<typeof LegacyCareDecisionDialog>) {
  if(!props.open)return null;
  return <DecisionGate key={props.patientId} {...props}/>;
}
function DecisionGate(props:React.ComponentProps<typeof LegacyCareDecisionDialog>) {
  const api=useClinicalAPI();const fetch=useCallback(()=>readLaunchChart(()=>api.launch().chart(props.patientId)),[api,props.patientId]);const chart=useRead(fetch);
  if(chart.status==='ready'&&chart.data===null)return <LegacyCareDecisionDialog {...props}/>;
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent><DialogHeader><DialogTitle>Case review</DialogTitle><DialogDescription>Factual photo review is separate from case approval. Open the enrollment or check-in review to decide on the complete submission.</DialogDescription></DialogHeader><LoadState {...chart} loading="Checking care review workflow"/>{chart.data&&<Button variant="outline" asChild><a href={`/patients/${encodeURIComponent(props.patientId)}?reviewKind=enrollment&reviewTarget=${encodeURIComponent(chart.data.enrollment.case.id)}`}>Open enrollment review</a></Button>}</DialogContent></Dialog>;
}

export function LaunchReviewDialog({patientId,enrollment,checkIn,open,onClose,onChanged}:{patientId:string;enrollment:LaunchEnrollmentResponse;checkIn?:LaunchCheckIn;open:boolean;onClose:()=>void;onChanged:()=>void}) {
  if(!open)return null;
  return <LaunchReviewAttempt key={`${patientId}-${enrollment.case.revision}-${checkIn?.id??'case'}`} {...{patientId,enrollment,checkIn,onClose,onChanged}}/>;
}
function LaunchReviewAttempt({patientId,enrollment,checkIn,onClose,onChanged}:{patientId:string;enrollment:LaunchEnrollmentResponse;checkIn?:LaunchCheckIn;onClose:()=>void;onChanged:()=>void}) {
  const api=useClinicalAPI();const [outcome,setOutcome]=useState<LaunchReviewBody['outcome']>('approve');const [message,setMessage]=useState('');const [blocked,setBlocked]=useState('');
  const changed=useRef(onChanged);changed.current=onChanged;
  const action=useMemo(()=>new IdempotentAction<LaunchReviewBody,LaunchReviewResult>(async(id,body)=>{
    try{return await api.launch().review(patientId,id,body);}catch(error){
      const status=typeof error==='object'&&error!==null&&'status' in error?error.status:null;
      if(status===409)setBlocked('The record changed. Reload and re-review before deciding.');
      if(status===401||status===403||status===404){setBlocked('Access is no longer available. Refresh your current assignment.');changed.current();}
      throw error;
    }
  }),[api,patientId]);
  const state=useSyncExternalStore(action.subscribe,action.snapshot,action.snapshot);
  useEffect(()=>()=>action.cancel(),[action]);
  const prerequisite=launchReviewBlock(enrollment,checkIn);const frozen=action.frozenBody!==null;
  const submit=async()=>{
    const result=await action.submit({targetType:checkIn?'check_in':'case',targetId:checkIn?.id??enrollment.case.id,expectedRevision:enrollment.case.revision,outcome,patientMessage:message.trim()||null});
    if(result==='saved'||result==='cancelled'){changed.current();if(result==='saved')onClose();}
  };
  return <Dialog open onOpenChange={next=>{if(!next)onClose();}}><DialogContent><DialogHeader><DialogTitle>{checkIn?'Check-in review':'Clinical case review'}</DialogTitle><DialogDescription>Record your manual clinical decision on the complete submission. Prior submissions remain in the chart.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();void submit();}}>
      <fieldset disabled={frozen||!!blocked} className="space-y-2"><legend className="text-sm font-medium">Review outcome</legend>{(['approve','needs_changes','reject'] as const).map(value=><label className="flex items-center gap-2 text-sm" key={value}><input type="radio" name="launch-outcome" checked={outcome===value} onChange={()=>setOutcome(value)}/>{value==='approve'?'Approve':value==='needs_changes'?'Request corrections':'Reject'}</label>)}</fieldset>
      {outcome==='approve'&&prerequisite&&<p role="alert">{prerequisite}</p>}
      {outcome==='reject'&&<p className="text-sm">Rejection requests a full refund of the latest paid invoice and immediate subscription cancellation. Provider confirmation may be pending or failed; refresh the chart to confirm.</p>}
      <label className="block text-sm">Message to patient{outcome!=='approve'?' (required)':' (optional)'}<Textarea required={outcome!=='approve'} maxLength={2000} value={message} disabled={frozen||!!blocked} onChange={e=>setMessage(e.target.value)}/></label>
      {state.status==='error'&&<p role="alert">{blocked||state.error}</p>}
      {blocked?<Button type="button" variant="outline" onClick={()=>{changed.current();onClose();}}>Reload for re-review</Button>:<Button type="submit" disabled={state.status==='saving'||(!frozen&&((outcome==='approve'&&!!prerequisite)||(outcome!=='approve'&&!message.trim())))}>{state.status==='saving'?'Saving review…':frozen?'Retry same review':'Save review'}</Button>}
    </form>
  </DialogContent></Dialog>;
}
export function LaunchClinicalReview({patientId,enrollment,onChanged}:{patientId:string;enrollment:LaunchEnrollmentResponse;onChanged:()=>void}) {
  const [open,setOpen]=useState(false);
  return <section aria-label="Clinical case decision" className="space-y-3 border-t border-rule pt-4"><LaunchPhotoSet patientId={patientId} photoSet={enrollment.case.photoSet}/><p className="text-sm">Review the identity, consents, full intake, flags, destination and submitted photo set before deciding.</p><Button variant="outline" onClick={()=>setOpen(true)}>Review clinical case</Button><LaunchReviewDialog {...{patientId,enrollment,onChanged,open}} onClose={()=>setOpen(false)}/></section>;
}

/** Only skin photo IDs use the existing authorized original-image endpoint. */
export function LaunchPhotoSet({patientId,photoSet}:{patientId:string;photoSet:LaunchPhotoSet|null}) {
  const api=useClinicalAPI();const [open,setOpen]=useState(false);const [failed,setFailed]=useState(false);
  useEffect(()=>{setOpen(false);setFailed(false);},[patientId]);
  const fetch=useCallback(async()=>{
    if(!open||!photoSet)return [];
    setFailed(false);
    return Promise.all(photoSet.items.map(async item=>({...item,...await api.getPhotoOriginal(item.photoId)})));
  },[api,photoSet,open]);const originals=useRead(fetch);
  if(!photoSet)return <p className="text-sm">Required photo set missing.</p>;
  return <div className="space-y-3"><p className="text-sm">Photo set: {photoSet.status.replaceAll('_',' ')} · Required: {photoSet.requiredSlots.join(', ')}</p><Button variant="outline" onClick={()=>setOpen(!open)}>{open?'Close submitted skin photos':'Open submitted skin photos'}</Button>{open&&<>{failed&&<p role="alert">A photo link expired or is unavailable. Refresh submitted photo links to retry.</p>}<LoadState {...originals} loading="Loading submitted photo set"/><div className="grid gap-3 sm:grid-cols-3">{originals.data?.map(item=><figure key={item.photoId}><div className="photo-mat"><img className="aspect-[4/5] w-full object-contain" src={item.photoUrl} referrerPolicy="no-referrer" alt={`Submitted ${item.slot} skin photo`} onError={()=>setFailed(true)}/></div><figcaption className="text-sm">{item.slot}</figcaption></figure>)}</div><Button variant="outline" onClick={originals.retry}>Refresh submitted photo links</Button></>}</div>;
}
