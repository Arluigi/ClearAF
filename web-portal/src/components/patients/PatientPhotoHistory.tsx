'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useClinicalAPI } from '@/lib/auth';
import { sessionBoundary } from '@/lib/api';
import { PhotoHistoryController } from '@/lib/photo-history';
import { PrivateThumbnailController, type ThumbnailState } from '@/lib/private-thumbnail';
import type { PhotoSummary } from '@/types/api';

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

function Thumbnail({ photo, state }: { photo: PhotoSummary; state?: ThumbnailState }) {
  if (state?.status === 'ready' && state.url) return <PrivatePhoto key={state.url} photo={photo} url={state.url} />;
  return <p role="status" className="h-40 flex items-center justify-center p-4 text-sm">
    {state?.status === 'error' ? 'Preview unavailable. Use Refresh images to retry.' : 'Loading preview…'}
  </p>;
}

export default function PatientPhotoHistory({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const controller = useMemo(() => new PhotoHistoryController(page => api.getPatientPhotoSummaries(patientId, page, 12)), [api, patientId]);
  const thumbnails = useMemo(() => new PrivateThumbnailController((id, signal) => api.getPhotoThumbnail(id, signal)), [api]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const previews = useSyncExternalStore(thumbnails.subscribe, thumbnails.snapshot, thumbnails.snapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; url?: string; error?: boolean } | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const selectedPhoto = state.photos.find(photo => photo.id === selected);

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
    setDetail(null);
    setDetailRevision(value => value + 1);
    void controller.load(state.page);
  };
  return (
    <section aria-label="Patient photo history" className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-muted-foreground">Shared photos · Capture times shown in your local timezone</p>
        <Button variant="outline" size="sm" onClick={refresh} disabled={state.status === 'loading'}>Refresh images</Button>
      </div>
      {state.status === 'loading' && <p role="status">Loading photos…</p>}
      {state.status === 'error' && (
        <div role="alert" className="space-y-2">
          <p>{state.error}</p><Button onClick={refresh}>Retry photos</Button>
        </div>
      )}
      {state.status === 'ready' && <>
        {state.photos.length === 0 ? <p>No shared photos on this page.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {state.photos.map(photo => (
              <button key={photo.id} type="button"
                className="rounded-lg border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                aria-label={`Open photo from ${captureDate(photo)}`} onClick={() => setSelected(photo.id)}>
                <Thumbnail photo={photo} state={previews[photo.id]} />
                <p className="mt-2 text-sm font-medium">{captureDate(photo)}</p>
                {photo.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{photo.notes}</p>}
              </button>
            ))}
          </div>
        )}
        <nav aria-label="Photo pages" className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" disabled={state.page <= 1} onClick={() => { setSelected(null); void controller.load(state.page - 1); }}>Previous photos</Button>
          <p role="status" className="text-sm">Page {state.page} of {state.totalPages} · {state.total} photos</p>
          <Button variant="outline" disabled={state.page >= state.totalPages} onClick={() => { setSelected(null); void controller.load(state.page + 1); }}>Next photos</Button>
        </nav>
      </>}
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) { setSelected(null); setDetail(null); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Patient photo</DialogTitle>
            <DialogDescription>{selectedPhoto ? captureDate(selectedPhoto) : 'Reloading private photo access'}</DialogDescription>
          </DialogHeader>
          {selectedPhoto && detail?.id === selected && detail.url ? (
            <>
              <PrivatePhoto key={detail.url} photo={selectedPhoto} url={detail.url} full />
              {selectedPhoto.notes && <p className="whitespace-pre-wrap break-words">{selectedPhoto.notes}</p>}
            </>
          ) : detail?.id === selected && detail.error ? (
            <p role="alert">Photo could not be loaded. Use Refresh images to retry.</p>
          ) : <p role="status">Loading photo…</p>}
          <Button variant="outline" disabled={state.status === 'loading'} onClick={refresh}>Refresh images</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
