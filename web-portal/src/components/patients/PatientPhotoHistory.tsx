'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useRead } from '@/components/care-support/shared';
import { useAuth, useClinicalAPI } from '@/lib/auth';
import { sessionBoundary } from '@/lib/api';
import { PhotoFeedbackController } from '@/lib/photo-feedback';
import { PhotoHistoryController } from '@/lib/photo-history';
import { PhotoReviewController } from '@/lib/photo-review';
import { PrivateThumbnailController } from '@/lib/private-thumbnail';
import { activeRoutineVersion, type RoutineCareState } from '@/lib/routine-care';
import { comparePanes, defaultPair, firstName, replyTarget } from '@/lib/workspace';
import { writtenDay } from '@/lib/worklist';
import CareDecisionDialog from './CareDecisionDialog';
import { PhotoCompareView } from './workspace/PhotoCompareView';
import { PhotoReplyView } from './workspace/PhotoReplyView';
import { PhotoStrip } from './workspace/PhotoStrip';

export default function PatientPhotoHistory({ patientId, patientName, routine, onCareDecision, rail }: { patientId: string; patientName: string; routine: RoutineCareState; onCareDecision?: () => void; rail?: ReactNode }) {
  const api = useClinicalAPI();
  const { user } = useAuth();
  const clinicianId = user?.id ?? '';
  // The workspace rail's own data source: best-effort, so an unavailable check-in day just omits that quick-reply
  // chip rather than blocking or guessing (see docs/design/design-language.md, "Clinician quick replies").
  const checkInFetch = useCallback(() => api.getPatientResponses(patientId, 1), [api, patientId]);
  const checkIns = useRead(checkInFetch);
  const history = useMemo(() => new PhotoHistoryController(page => api.getPatientPhotoSummaries(patientId, page, 12)), [api, patientId]);
  const thumbnails = useMemo(() => new PrivateThumbnailController((id, signal) => api.getPhotoThumbnail(id, signal)), [api]);
  const reviews = useMemo(() => new PhotoReviewController(ids => api.getPhotoReviewStatus(ids), id => api.markPhotoReviewed(id), (id, signal) => api.getPhotoOriginal(id, signal)), [api]);
  // "Send & mark reviewed": the reply with its photo reference, then the existing per-photo review, owned by `reviews`.
  const feedback = useMemo(() => new PhotoFeedbackController(
    (id, body) => api.sendAssignedMessage(patientId, clinicianId, id, body),
    async photoId => {
      await reviews.mark(photoId);
      if (!reviews.snapshot().reviews[photoId]) throw new Error('Review not confirmed');
    },
  ), [api, patientId, clinicianId, reviews]);
  const state = useSyncExternalStore(history.subscribe, history.snapshot, history.snapshot);
  const previews = useSyncExternalStore(thumbnails.subscribe, thumbnails.snapshot, thumbnails.snapshot);
  const reviewState = useSyncExternalStore(reviews.subscribe, reviews.snapshot, reviews.snapshot);
  const reply = useSyncExternalStore(feedback.subscribe, feedback.snapshot, feedback.snapshot);
  const [zoom, setZoom] = useState(100);
  const [decisionPhotoId, setDecisionPhotoId] = useState<string | null>(null);
  const lastSelection = useRef<string[]>([]);

  useEffect(() => {
    void history.load(1);
    return () => history.cancel();
  }, [history]);
  useEffect(() => {
    thumbnails.load(state.photos.map(photo => photo.id));
    const unsubscribe = sessionBoundary.subscribe(() => thumbnails.dispose());
    return () => { unsubscribe(); thumbnails.dispose(); };
  }, [thumbnails, state.photos]);
  useEffect(() => {
    if (reviewState.selected.length) lastSelection.current = reviewState.selected;
  }, [reviewState.selected]);
  useEffect(() => {
    const ids = state.photos.map(photo => photo.id);
    // Refresh keeps the photos being compared when they are still on the page; a new page starts from the newest pair.
    const previous = lastSelection.current.filter(id => ids.includes(id));
    void reviews.load(ids, previous.length ? previous : defaultPair(state.photos));
    const unsubscribe = sessionBoundary.subscribe(() => { reviews.reset(); feedback.cancel(); });
    return () => { unsubscribe(); reviews.reset(); };
  }, [reviews, feedback, state.photos]);
  useEffect(() => () => feedback.cancel(), [feedback]);
  const selectedKey = reviewState.selected.join(',');
  const comparing = reviewState.comparing;
  useEffect(() => {
    if (selectedKey && !comparing) void reviews.compare();
  }, [reviews, selectedKey, comparing]);
  const targetId = replyTarget(state.photos, reviewState.selected)?.id ?? null;
  // target() no-ops while a send/mark is frozen, so a targetId change during the freeze is dropped. Re-running
  // this once reply.status changes (freeze clears) re-links the reply to the current target photo.
  useEffect(() => { feedback.target(targetId); }, [feedback, targetId, reply.status]);

  const ids = state.photos.map(photo => photo.id);
  const panes = comparePanes(state.photos, reviewState.selected);
  const replyPhoto = state.photos.find(photo => photo.id === reply.photoId) ?? null;
  const reviewed = replyPhoto ? Boolean(reviewState.reviews[replyPhoto.id]) : false;
  const name = firstName(patientName);
  const latestCheckIn = checkIns.data?.data[0] ?? null;
  const quickReplyContext = { activeVersion: activeRoutineVersion(routine), checkInDay: latestCheckIn ? writtenDay(latestCheckIn.submittedAt) : null };
  const refresh = () => { void history.load(state.page); };

  return <section aria-label="Patient photos" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-secondary">Capture times are shown in your local timezone.</p>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={state.status === 'loading'}>Refresh images</Button>
      </div>
      {state.status === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading photos</p>}
      {state.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">{state.error}</p><Button type="button" variant="outline" size="sm" onClick={refresh}>Retry photos</Button></div>}
      {reviewState.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">Review status is unavailable. Photos can still be compared.</p><Button type="button" variant="outline" size="sm" onClick={() => void reviews.load(ids, reviewState.selected)}>Retry review status</Button></div>}
      {state.status === 'ready' && state.photos.length === 0 && <div className="space-y-2 py-6">
        <h3 className="editorial-title text-2xl">No shared photos yet</h3>
        <p className="text-sm text-ink-secondary">Photos appear here after {name || 'the patient'} shares them from the app.</p>
      </div>}
      {state.status === 'ready' && state.photos.length > 0 && <>
        <PhotoCompareView
          panes={panes.map(photo => ({ photo, original: reviewState.originals[photo.id], review: reviewState.reviews[photo.id] }))}
          zoom={zoom}
          onZoom={setZoom}
          onRetry={() => reviews.close()}
          onFail={id => reviews.failOriginal(id)}
        />
        <PhotoReplyView
          patientFirstName={name}
          target={replyPhoto}
          feedback={reply}
          frozen={feedback.frozen}
          reviewed={reviewed}
          reviewPending={replyPhoto ? Boolean(reviewState.pending[replyPhoto.id]) : false}
          reviewError={replyPhoto ? Boolean(reviewState.errors[replyPhoto.id]) : false}
          reviewUnavailable={reviewState.status !== 'ready'}
          quickReplyContext={quickReplyContext}
          onEdit={text => feedback.edit(text)}
          onSubmit={() => void feedback.submit(reviewed || reviewState.status !== 'ready')}
          onNewDraft={() => feedback.newDraft()}
          onLeaveUnreviewed={() => feedback.leaveUnreviewed()}
          onMarkOnly={() => { if (replyPhoto) void reviews.mark(replyPhoto.id); }}
          onCareDecision={() => { if (replyPhoto) setDecisionPhotoId(replyPhoto.id); }}
        />
      </>}
    </div>
    <aside aria-label="Photos and care summary" className="min-w-0 space-y-8">
      {state.status === 'ready' && state.photos.length > 0 && <PhotoStrip
        photos={state.photos}
        previews={previews}
        selected={reviewState.selected}
        reviews={reviewState.reviews}
        reviewStatus={reviewState.status}
        total={state.total}
        page={state.page}
        totalPages={state.totalPages}
        frozen={feedback.frozen}
        onToggle={id => reviews.toggle(id)}
        onPage={page => { void history.load(page); }}
      />}
      {rail}
    </aside>
    <CareDecisionDialog
      patientId={patientId}
      photoId={decisionPhotoId}
      defaultDecision="refer_out"
      open={decisionPhotoId !== null}
      onOpenChange={open => { if (!open) setDecisionPhotoId(null); }}
      onSaved={() => { setDecisionPhotoId(null); onCareDecision?.(); }}
      onSettledAfterClose={() => onCareDecision?.()}
    />
  </section>;
}
