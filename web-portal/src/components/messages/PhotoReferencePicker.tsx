"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LoadState, Pages, useRead } from "@/components/care-support/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { sessionBoundary } from "@/lib/api";
import { useClinicalAPI } from "@/lib/auth";
import { PrivateThumbnailController } from "@/lib/private-thumbnail";
import type { PhotoSummary } from "@/types/api";
import { PhotoReferenceList } from "./PhotoReferenceList";

export default function PhotoReferencePicker({ patientId, onChoose, onClose }: { patientId: string; onChoose: (photo: PhotoSummary) => void; onClose: () => void }) {
  const api = useClinicalAPI();
  const [page, setPage] = useState(1);
  const fetch = useCallback(() => api.getPatientPhotoSummaries(patientId, page, 12), [api, patientId, page]);
  const result = useRead(fetch);
  const thumbnails = useMemo(() => new PrivateThumbnailController((id, signal) => api.getPhotoThumbnail(id, signal)), [api]);
  const previews = useSyncExternalStore(thumbnails.subscribe, thumbnails.snapshot, thumbnails.snapshot);
  const photos = result.data?.data;
  useEffect(() => {
    if (!photos) return;
    thumbnails.load(photos.map((photo) => photo.id));
    const unsubscribe = sessionBoundary.subscribe(() => thumbnails.dispose());
    return () => { unsubscribe(); thumbnails.dispose(); };
  }, [thumbnails, photos]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Attach photo reference</DialogTitle>
        <DialogDescription>The message links this photo. It is checked against your current patient assignment when opened.</DialogDescription>
        <LoadState {...result} loading="Loading photos" />
        {photos && <PhotoReferenceList photos={photos} previews={previews} onChoose={onChoose} />}
        {result.data && result.data.pagination.totalPages > 1 && <Pages page={page} totalPages={result.data.pagination.totalPages} onPage={setPage} />}
      </DialogContent>
    </Dialog>
  );
}
