'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FeedbackState } from '@/lib/photo-feedback';
import { day } from '@/lib/worklist';
import type { PhotoSummary } from '@/types/api';

const submitLabel = (status: FeedbackState['status'], reviewed: boolean) =>
  status === 'sending' ? 'Sending…'
    : status === 'marking' ? 'Marking reviewed…'
      : status === 'send-failed' ? 'Retry same message'
        : status === 'mark-failed' ? 'Retry marking reviewed'
          : reviewed ? 'Send reply' : 'Send & mark reviewed';

export function PhotoReplyView({ patientFirstName, target, feedback, frozen, reviewed, reviewPending, reviewError, onEdit, onSubmit, onNewDraft, onLeaveUnreviewed, onMarkOnly, onCareDecision }: {
  patientFirstName: string; target: PhotoSummary | null; feedback: FeedbackState; frozen: boolean; reviewed: boolean;
  reviewPending: boolean; reviewError: boolean; onEdit: (text: string) => void; onSubmit: () => void; onNewDraft: () => void;
  onLeaveUnreviewed: () => void; onMarkOnly: () => void; onCareDecision: () => void;
}) {
  const { status, text } = feedback;
  const busy = status === 'sending' || status === 'marking';
  const retrying = status === 'send-failed' || status === 'mark-failed';
  const canSubmit = !busy && (retrying || (target !== null && text.trim().length > 0));
  return <section aria-label="Reply about this photo" className="space-y-3 border-t border-rule pt-5">
    {target?.notes && <div className="space-y-1">
      <p className="eyebrow">Patient note on {day(target.captureDate)}</p>
      <p className="max-w-prose whitespace-pre-wrap break-words font-display text-lg font-light">“{target.notes}”</p>
    </div>}
    <Label htmlFor="photo-reply" className="block">Reply about this photo</Label>
    <Textarea id="photo-reply" className="min-h-28" maxLength={4000} value={text} disabled={frozen || !target} placeholder={`Write to ${patientFirstName || 'the patient'}…`} onChange={event => onEdit(event.target.value)} />
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={!canSubmit} onClick={onSubmit}>{submitLabel(status, reviewed)}</Button>
      {target && !reviewed && <Button type="button" variant="outline" disabled={reviewPending || frozen} onClick={onMarkOnly}>{reviewPending ? 'Saving review…' : 'Mark reviewed without reply'}</Button>}
      <Button type="button" variant="outline" disabled={!target} onClick={onCareDecision}>Refer out or in-person…</Button>
      {target && <span className="meta-mono">Links photo {day(target.captureDate)}</span>}
    </div>
    {!target && <p className="text-xs text-ink-secondary">Select a photo to reply about it.</p>}
    {target && status === 'draft' && !text.trim() && <p className="text-xs text-ink-secondary">Write a reply to send it with this photo linked.</p>}
    {status === 'send-failed' && <div role="alert" className="space-y-2">
      <p className="text-sm text-error">Message could not be confirmed. The photo is not marked reviewed. Retry sends the same message.</p>
      <p className="text-xs text-ink-secondary">A previous attempt may already have been sent. Check the Messages tab before writing another.</p>
      <Button type="button" variant="outline" size="sm" onClick={onNewDraft}>Edit as a new message</Button>
    </div>}
    {status === 'mark-failed' && <div role="alert" className="space-y-2">
      <p className="text-sm text-error">Message sent. The photo is not marked reviewed yet.</p>
      <Button type="button" variant="outline" size="sm" onClick={onLeaveUnreviewed}>Leave photo unreviewed</Button>
    </div>}
    {status === 'sent' && <p role="status" className="text-sm">{feedback.reviewed ? 'Sent. Photo marked reviewed.' : 'Sent.'}</p>}
    {reviewError && <p role="alert" className="text-sm text-error">Review could not be saved. Try again.</p>}
  </section>;
}
