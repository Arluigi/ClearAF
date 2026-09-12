'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useClinicalAPI } from '@/lib/auth';
import { PhotoHistoryController } from '@/lib/photo-history';
import type { Photo } from '@/types/api';

function captureDate(photo: Photo) {
  return new Date(photo.captureDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function PrivatePhoto({ photo, full = false }: { photo: Photo; full?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="status" className="p-4 text-sm">Image unavailable. Use Refresh images to renew access and try again.</p>;
  // A signed private URL must go directly to Storage, never through an image optimizer.
  return <Image unoptimized referrerPolicy="no-referrer" src={photo.photoUrl}
    alt={`Photo captured ${captureDate(photo)}`} width={1200} height={900}
    className={full ? 'w-full h-auto max-h-[65vh] object-contain' : 'w-full h-40 object-contain'}
    onError={() => setFailed(true)} />;
}

export default function PatientPhotoHistory({ patientId }: { patientId: string }) {
  const api = useClinicalAPI();
  const controller = useMemo(() => new PhotoHistoryController(page => api.getPatientPhotos(patientId, page, 12)), [api, patientId]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedPhoto = state.photos.find(photo => photo.id === selected);
  useEffect(() => { void controller.load(1); return () => controller.cancel(); }, [controller]);
  const refresh = () => { void controller.load(state.page); };
  return <section aria-label="Patient photo history" className="space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <p className="text-sm text-muted-foreground">Shared photos · Capture times shown in your local timezone</p>
      <Button variant="outline" size="sm" onClick={refresh} disabled={state.status === 'loading'}>Refresh images</Button>
    </div>
    {state.status === 'loading' && <p role="status">Loading photos…</p>}
    {state.status === 'error' && <div role="alert" className="space-y-2"><p>{state.error}</p><Button onClick={refresh}>Retry photos</Button></div>}
    {state.status === 'ready' && <>
      {state.photos.length === 0 ? <p>No shared photos on this page.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {state.photos.map(photo => <button key={photo.id} type="button" className="rounded-lg border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label={`Open photo from ${captureDate(photo)}`} onClick={() => setSelected(photo.id)}>
          <PrivatePhoto key={photo.photoUrl} photo={photo} />
          <p className="mt-2 text-sm font-medium">{captureDate(photo)}</p>
          {photo.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{photo.notes}</p>}
        </button>)}
      </div>}
      <nav aria-label="Photo pages" className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" disabled={state.page <= 1} onClick={() => { setSelected(null); void controller.load(state.page - 1); }}>Previous photos</Button>
        <p role="status" className="text-sm">Page {state.page} of {state.totalPages} · {state.total} photos</p>
        <Button variant="outline" disabled={state.page >= state.totalPages} onClick={() => { setSelected(null); void controller.load(state.page + 1); }}>Next photos</Button>
      </nav>
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Patient photo</DialogTitle><DialogDescription>{selectedPhoto ? captureDate(selectedPhoto) : 'Reloading private photo access'}</DialogDescription></DialogHeader>
        {selectedPhoto ? <><PrivatePhoto key={selectedPhoto.photoUrl} photo={selectedPhoto} full />
          {selectedPhoto.notes && <p className="whitespace-pre-wrap break-words">{selectedPhoto.notes}</p>}</> : <p role={state.status === 'error' ? 'alert' : 'status'}>{state.status === 'error' ? state.error : state.status === 'loading' ? 'Loading photo…' : 'This photo is no longer available. Close this view and refresh the history.'}</p>}
        <Button variant="outline" disabled={state.status === 'loading'} onClick={refresh}>Refresh images</Button>
      </DialogContent>
    </Dialog>
  </section>;
}
