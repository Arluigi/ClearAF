/* eslint-disable @next/next/no-img-element -- Thumbnails are private object URLs revoked when the page changes. */
'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { PhotoReview } from '@/lib/photo-review';
import type { ThumbnailState } from '@/lib/private-thumbnail';
import { day, stamp } from '@/lib/worklist';
import type { PhotoSummary } from '@/types/api';

export function PhotoStrip({ photos, previews, selected, reviews, reviewStatus, total, page, totalPages, onToggle, onPage }: {
  photos: PhotoSummary[]; previews: Record<string, ThumbnailState>; selected: string[]; reviews: Record<string, PhotoReview>;
  reviewStatus: 'loading' | 'ready' | 'error'; total: number; page: number; totalPages: number;
  onToggle: (id: string) => void; onPage: (page: number) => void;
}) {
  const words = (id: string) => reviewStatus === 'ready' ? (reviews[id] ? 'Reviewed' : 'Not reviewed') : reviewStatus === 'error' ? 'Review status unavailable' : 'Checking review';
  const unreviewed = reviewStatus === 'ready' ? photos.filter(photo => !reviews[photo.id]).length : null;
  return <section aria-label="All photos" className="space-y-3">
    <p className="eyebrow">All photos · {total}</p>
    <ul className="grid grid-cols-2 gap-2">{photos.map(photo => {
      const pressed = selected.includes(photo.id);
      const preview = previews[photo.id];
      return <li key={photo.id}>
        <button type="button" aria-pressed={pressed} aria-label={`${pressed ? 'Remove from comparison' : 'Add to comparison'}: photo from ${stamp(photo.captureDate)}, ${words(photo.id)}`} disabled={!pressed && selected.length >= 2} onClick={() => onToggle(photo.id)} className="block w-full text-left disabled:cursor-not-allowed aria-pressed:selected-outline aria-pressed:focus-visible:outline-offset-2">
          <span className="photo-mat flex aspect-[4/5] items-center justify-center overflow-hidden">
            {preview?.status === 'ready' && preview.url
              ? <img src={preview.url} alt="" className="h-full w-full object-contain" />
              : <span className="p-2 text-center text-[11px]">{preview?.status === 'error' ? 'Preview unavailable' : 'Loading'}</span>}
          </span>
          <span className="mt-1 block font-data text-[11px] font-medium tabular-nums">{day(photo.captureDate)}</span>
          <span className="block text-[11px] text-ink-secondary">{words(photo.id)}</span>
        </button>
      </li>;
    })}</ul>
    <p className="meta-mono">{selected.length} selected{unreviewed === null ? '' : ` · ${unreviewed} not reviewed on this page`}</p>
    {selected.length >= 2 && <p className="text-xs text-ink-secondary">Two photos selected. Deselect one to compare another.</p>}
    <nav aria-label="Photo pages" className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="meta-mono">Page {page} of {totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  </section>;
}
