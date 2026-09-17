'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClinicalAPI } from '@/lib/auth';
import { IdempotentAction, decisionBody, showsPatientMessage } from '@/lib/care-decisions';
import type { CareDecision, DecisionBody, DecisionKind } from '@/lib/care-decisions';

const MAX_MESSAGE = 2000;

export default function CareDecisionDialog({
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
