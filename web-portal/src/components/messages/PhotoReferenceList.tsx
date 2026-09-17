/* eslint-disable @next/next/no-img-element -- Thumbnails are private object URLs revoked when the dialog closes. */
"use client";
import * as React from "react";
import type { ThumbnailState } from "@/lib/private-thumbnail";
import { day, stamp } from "@/lib/worklist";
import type { PhotoSummary } from "@/types/api";

export function PhotoReferenceList({ photos, previews, onChoose }: { photos: PhotoSummary[]; previews: Record<string, ThumbnailState>; onChoose: (photo: PhotoSummary) => void }) {
  if (!photos.length) return <p className="text-sm text-ink-secondary">No shared photos to attach.</p>;
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {photos.map((photo) => {
        const preview = previews[photo.id];
        return (
          <li key={photo.id}>
            <button type="button" aria-label={`Attach photo from ${stamp(photo.captureDate)}`} onClick={() => onChoose(photo)} className="block w-full text-left">
              <span className="photo-mat flex aspect-[4/5] items-center justify-center overflow-hidden">
                {preview?.status === "ready" && preview.url
                  ? <img src={preview.url} alt="" className="h-full w-full object-contain" />
                  : <span className="p-2 text-center text-[11px]">{preview?.status === "error" ? "Preview unavailable" : "Loading"}</span>}
              </span>
              <span className="mt-1 block font-data text-[11px] font-medium tabular-nums">{day(photo.captureDate)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
