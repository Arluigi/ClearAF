'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClinicalAPI } from '@/lib/auth';
import { IdempotentAction } from '@/lib/care-decisions';
import type { CareDecision, DecisionBody, DecisionKind } from '@/lib/care-decisions';

const MAX_MESSAGE = 2000;

export default function CareDecisionDialog({
  patientId,
  photoId,
  defaultDecision,
  open,
  onOpenChange,
  onSaved,
}: {
  patientId: string;
  photoId: string | null;
  defaultDecision: DecisionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: CareDecision) => void;
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
  const helper = decision !== 'async_care';

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
          <DialogDescription>Record how this case should proceed. The patient is notified with the message below.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.submit({ decision, patientMessage: message.trim() ? message : null, photoId });
          }}
        >
          <fieldset disabled={disabled} className="space-y-2">
            <legend className="text-sm font-medium">Care decision</legend>
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
                    onChange={() => setDecision('async_care')}
                  />
                  Resume online care
                </label>
              )}
            </div>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="care-decision-message">Message to the patient (optional)</Label>
            <Textarea
              id="care-decision-message"
              maxLength={MAX_MESSAGE}
              disabled={disabled}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {message.length}/{MAX_MESSAGE}
            </p>
            {helper && <p className="text-sm text-muted-foreground">Shown to the patient with next steps. A refund will be marked pending.</p>}
          </div>
          {state.status === 'error' && (
            <p role="alert" className="flex items-center gap-1 text-sm">
              <AlertTriangle aria-hidden className="h-4 w-4 text-destructive" />
              {state.error}
            </p>
          )}
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
