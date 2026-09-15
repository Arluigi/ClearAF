'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useClinicalAPI } from '@/lib/auth';
import { sessionBoundary } from '@/lib/api';
import { PhotoHistoryController, photoDetailState, type PhotoOriginalState } from '@/lib/photo-history';
import { PrivateThumbnailController, type ThumbnailState } from '@/lib/private-thumbnail';
import { PhotoReviewController } from '@/lib/photo-review';
import CareDecisionDialog from './CareDecisionDialog';
import type { PhotoSummary } from '@/types/api';

type PhotoFocusTarget = Pick<HTMLElement, 'isConnected' | 'focus'>;

// Radix calls this for every close path, including Escape and its Close button.
export function restorePhotoFocus(event: Event, origin: PhotoFocusTarget | null, fallback: PhotoFocusTarget | null) {
  event.preventDefault();
  const target = origin?.isConnected ? origin : fallback?.isConnected ? fallback : null;
  target?.focus();
}

function captureDate(photo: PhotoSummary) {
  return new Date(photo.captureDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function PrivatePhoto({ url, photo, full = false }: { url: string; photo: PhotoSummary; full?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="status" className="p-4 text-sm">Image unavailable. Use Refresh images to try again.</p>;
  return (
    <Image unoptimized referrerPolicy="no-referrer" src={url}
      alt={`Photo captured ${captureDate(photo)}`} width={full ? 1200 : 400} height={full ? 900 : 400}
      className={full ? 'w-full h-auto max-h-[65vh] object-contain' : 'w-full h-40 object-contain'}
      onError={() => setFailed(true)} />
  );
}

function ComparisonImage({ url, photo, zoom }: { url: string; photo: PhotoSummary; zoom: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="status" className="p-4">Image unavailable. Retry comparison.</p>;
  return <div style={{ width: `${zoom}%`, height: `${zoom}%` }}>
    <Image unoptimized referrerPolicy="no-referrer" src={url} alt={`Photo captured ${captureDate(photo)}`}
      width={1200} height={1200} className="w-full h-full object-contain" onError={() => setFailed(true)} />
  </div>;
}

function Thumbnail({ photo, state }: { photo: PhotoSummary; state?: ThumbnailState }) {
  if (state?.status === 'ready' && state.url) return <PrivatePhoto key={state.url} photo={photo} url={state.url} />;
  return <p role="status" className="h-40 flex items-center justify-center p-4 text-sm">
    {state?.status === 'error' ? 'Preview unavailable. Use Refresh images to retry.' : 'Loading preview…'}
  </p>;
}

export default function PatientPhotoHistory({ patientId, onCareDecision }: { patientId: string; onCareDecision?: () => void }) {
  const api = useClinicalAPI();
  const photoTrigger = useRef<HTMLButtonElement>(null);
  const historySection = useRef<HTMLElement>(null);
  const controller = useMemo(() => new PhotoHistoryController(page => api.getPatientPhotoSummaries(patientId, page, 12)), [api, patientId]);
  const thumbnails = useMemo(() => new PrivateThumbnailController((id, signal) => api.getPhotoThumbnail(id, signal)), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const previews = useSyncExternalStore(thumbnails.subscribe, thumbnails.snapshot, thumbnails.snapshot);
  const reviews = useMemo(() => new PhotoReviewController(ids => api.getPhotoReviewStatus(ids), id => api.markPhotoReviewed(id), (id, signal) => api.getPhotoOriginal(id, signal)), [api]);
  const reviewState = useSyncExternalStore(reviews.subscribe, reviews.snapshot, reviews.snapshot);
  const [zoom, setZoom] = useState(100);
  const compareTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void reviews.load(state.photos.map(photo => photo.id));
    const unsubscribe = sessionBoundary.subscribe(() => { reviews.reset(); setSelected(null); setDetail(null); });
    return () => { unsubscribe(); reviews.reset(); };
  }, [reviews, state.photos]);
  const [selected, setSelected] = useState<string | null>(null);
  const [decisionPhotoId, setDecisionPhotoId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PhotoOriginalState | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const selectedPhoto = state.photos.find(photo => photo.id === selected);
  const detailState = photoDetailState(state, selected, detail);

  useEffect(() => {
    void controller.load(1);
    return () => controller.cancel();
  }, [controller]);
  useEffect(() => {
    thumbnails.load(state.photos.map(photo => photo.id));
    const unsubscribe = sessionBoundary.subscribe(() => thumbnails.dispose());
    return () => { unsubscribe(); thumbnails.dispose(); };
  }, [thumbnails, state.photos]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    let current = true;
    setDetail({ id: selected });
    void api.getPhotoOriginal(selected, abort.signal).then(result => {
      if (current) setDetail({ id: selected, url: result.photoUrl });
    }).catch(() => {
      if (current && !abort.signal.aborted) setDetail({ id: selected, error: true });
    });
    const unsubscribe = sessionBoundary.subscribe(() => {
      current = false;
      abort.abort();
      setDetail(null);
    });
    return () => { current = false; abort.abort(); unsubscribe(); };
  }, [api, selected, detailRevision]);

  const refresh = () => {
    reviews.reset();
    setDetail(null);
    setDetailRevision(value => value + 1);
    void controller.load(state.page);
  };
  return (
    <section ref={historySection} tabIndex={-1} aria-label="Patient photo history" className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div><h2 className="text-lg font-semibold">Shared photos</h2><p className="text-sm text-muted-foreground">Capture times shown in your local timezone</p></div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={state.status === 'loading'}>Refresh images</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">Select two photos on this page to compare ({reviewState.selected.length}/2).</p>
        <Button ref={compareTrigger} variant="outline" disabled={reviewState.selected.length !== 2} onClick={() => { setZoom(100); void reviews.compare(); }}>Compare photos</Button>
      </div>
      {reviewState.status === 'error' && <div role="alert"><p>Review status unavailable.</p><Button variant="outline" onClick={() => void reviews.load(state.photos.map(photo => photo.id))}>Retry review status</Button></div>}
      {state.status === 'loading' && <p role="status">Loading photos…</p>}
      {state.status === 'error' && (
        <div role="alert" className="space-y-2">
          <p>{state.error}</p><Button onClick={refresh}>Retry photos</Button>
        </div>
      )}
      {state.status === 'ready' && <>
        {state.photos.length === 0 ? <p>No shared photos on this page.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.photos.map(photo => (
              <div key={photo.id} className="rounded-xl bg-card p-3 space-y-3"><button type="button"
                className="rounded-xl bg-card p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={`Open photo from ${captureDate(photo)}`} onClick={event => { photoTrigger.current = event.currentTarget; setSelected(photo.id); }}>
                <Thumbnail photo={photo} state={previews[photo.id]} />
                <p className="mt-2 text-sm font-medium">{captureDate(photo)}</p>
                {photo.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{photo.notes}</p>}
              </button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewState.selected.includes(photo.id)} disabled={!reviewState.selected.includes(photo.id) && reviewState.selected.length >= 2} onChange={() => reviews.toggle(photo.id)} />Select photo from {captureDate(photo)} for comparison</label>
              {reviewState.status === 'loading' ? <p role="status" className="text-sm">Loading review status…</p> : reviewState.status === 'ready' && (reviewState.reviews[photo.id] ? <p className="text-sm">Reviewed by {reviewState.reviews[photo.id].reviewerName} · {new Date(reviewState.reviews[photo.id].reviewedAt).toLocaleString()}</p> : <div className="space-y-2"><p className="text-sm">Not reviewed</p>{reviewState.errors[photo.id] && <p role="alert" className="text-sm">Review could not be saved. Try again.</p>}<Button size="sm" variant="outline" disabled={reviewState.pending[photo.id]} onClick={() => void reviews.mark(photo.id)}>{reviewState.pending[photo.id] ? 'Saving review…' : reviewState.errors[photo.id] ? 'Retry marking reviewed' : 'Mark reviewed'}</Button></div>)}
              <Button size="sm" variant="outline" onClick={() => setDecisionPhotoId(photo.id)}>Refer out or in-person…</Button>
              </div>
            ))}
          </div>
        )}
        <nav aria-label="Photo pages" className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" disabled={state.page <= 1} onClick={() => { setSelected(null); reviews.reset(); void controller.load(state.page - 1); }}>Previous photos</Button>
          <p role="status" className="text-sm">Page {state.page} of {state.totalPages} · {state.total} photos</p>
          <Button variant="outline" disabled={state.page >= state.totalPages} onClick={() => { setSelected(null); reviews.reset(); void controller.load(state.page + 1); }}>Next photos</Button>
        </nav>
      </>}
      <Dialog open={reviewState.comparing} onOpenChange={open => { if (!open) reviews.close(); }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto" onCloseAutoFocus={event => restorePhotoFocus(event, compareTrigger.current, historySection.current)}>
          <DialogHeader><DialogTitle>Compare photos</DialogTitle><DialogDescription>Capture times shown in your local timezone. Lighting and capture conditions may differ.</DialogDescription></DialogHeader>
          <div className="flex flex-wrap items-center gap-3"><label htmlFor="comparison-zoom">Zoom {zoom}%</label><input id="comparison-zoom" type="range" min={100} max={300} step={25} value={zoom} onChange={event => setZoom(Number(event.target.value))} /><Button variant="outline" onClick={() => setZoom(100)}>Reset zoom</Button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{reviewState.selected.map(id => {
            const photo = state.photos.find(item => item.id === id);
            const original = reviewState.originals[id];
            return photo && <figure key={id} className="min-w-0"><figcaption className="text-sm mb-2">{captureDate(photo)}</figcaption><div tabIndex={0} role="region" aria-label={`Scrollable photo from ${captureDate(photo)}`} className="h-[40vh] overflow-auto rounded-xl bg-muted">{original?.url ? <ComparisonImage key={original.url} url={original.url} photo={photo} zoom={zoom} /> : <p role={original?.error ? 'alert' : 'status'} className="p-4">{original?.error ? 'Photo unavailable. Retry comparison.' : 'Loading photo…'}</p>}</div></figure>;
          })}</div>
          <Button variant="outline" onClick={() => void reviews.compare()}>Retry comparison</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) { setSelected(null); setDetail(null); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={event => {
            restorePhotoFocus(event, photoTrigger.current, historySection.current);
            photoTrigger.current = null;
          }}>
          <DialogHeader>
            <DialogTitle>Patient photo</DialogTitle>
            <DialogDescription>{selectedPhoto ? captureDate(selectedPhoto) : 'Reloading private photo access'}</DialogDescription>
          </DialogHeader>
          {detailState.status === 'ready' ? (
            <>
              <a className="underline" href={"/messages?patient="+encodeURIComponent(patientId)+"&referenceType=photo&referenceId="+encodeURIComponent(detailState.photo.id)}>Send feedback about this photo</a>
              <PrivatePhoto key={detailState.url} photo={detailState.photo} url={detailState.url} full />
              {detailState.photo.notes && <p className="whitespace-pre-wrap break-words">{detailState.photo.notes}</p>}
            </>
          ) : <p role={detailState.status === 'error' ? 'alert' : 'status'}>{detailState.message}</p>}
          <Button variant="outline" disabled={state.status === 'loading'} onClick={refresh}>Refresh images</Button>
        </DialogContent>
      </Dialog>
      <CareDecisionDialog
        patientId={patientId}
        photoId={decisionPhotoId}
        defaultDecision="refer_out"
        open={decisionPhotoId !== null}
        onOpenChange={open => { if (!open) setDecisionPhotoId(null); }}
        onSaved={() => { setDecisionPhotoId(null); onCareDecision?.(); }}
      />
    </section>
  );
}
