/* eslint-disable @next/next/no-img-element -- Signed originals expire in minutes and must not enter the image optimizer cache. */
'use client';
import * as React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PhotoReview } from '@/lib/photo-review';
import { reviewWords } from '@/lib/workspace';
import { stamp } from '@/lib/worklist';
import type { PhotoSummary } from '@/types/api';

export interface ComparePane { photo: PhotoSummary; original?: { url?: string; error?: boolean }; review?: PhotoReview }

function Original({ pane, zoom, onFail }: { pane: ComparePane; zoom: number; onFail: () => void }) {
  const [failed, setFailed] = useState(false);
  const when = stamp(pane.photo.captureDate);
  if (pane.original?.url && !failed) return <div style={{ width: `${zoom}%`, height: `${zoom}%` }}>
    {/* The signed URL loaded but the image itself can still fail (expired, broken link): surface that to the
       controller so Retry originals appears, not just this pane's local text. */}
    <img src={pane.original.url} referrerPolicy="no-referrer" alt={`Photo captured ${when}`} className="h-full w-full object-contain" onError={() => { setFailed(true); onFail(); }} />
  </div>;
  const error = failed || pane.original?.error;
  return <p role={error ? 'alert' : 'status'} className="p-4 text-sm">{error ? 'Original unavailable. Use Retry originals.' : 'Loading original'}</p>;
}

// Compare is the default Photos view (spec §6 portal #2): originals, untinted and uncropped, on a near-black mat.
export function PhotoCompareView({ panes, zoom, onZoom, onRetry, onFail }: { panes: ComparePane[]; zoom: number; onZoom: (zoom: number) => void; onRetry: () => void; onFail: (photoId: string) => void }) {
  if (!panes.length) return <div className="space-y-2 border-y border-rule py-8">
    <h3 className="editorial-title text-2xl">Choose photos to compare</h3>
    <p className="text-sm text-ink-secondary">Select one or two photos from All photos to view the originals here.</p>
  </div>;
  return <section aria-label="Photo comparison" className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <p className="eyebrow">{panes.length === 2 ? 'Comparing' : 'Viewing'}</p>
      <label htmlFor="comparison-zoom" className="ml-auto text-[13px] font-medium text-ink-secondary">Zoom</label>
      <input id="comparison-zoom" type="range" min={100} max={300} step={25} value={zoom} onChange={event => onZoom(Number(event.target.value))} className="w-32" />
      <span className="font-data text-xs font-medium tabular-nums">{zoom}%</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => onZoom(100)}>Reset zoom</Button>
    </div>
    <div className={panes.length === 2 ? 'grid gap-2 sm:grid-cols-2' : 'grid'}>
      {panes.map(pane => <figure key={pane.photo.id} className="min-w-0">
        <div tabIndex={0} role="region" aria-label={`Scrollable photo from ${stamp(pane.photo.captureDate)}`} className="photo-mat aspect-[4/5] overflow-auto">
          <Original key={pane.original?.url ?? pane.photo.id} pane={pane} zoom={zoom} onFail={() => onFail(pane.photo.id)} />
        </div>
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
          <span className="font-data text-xs font-medium tabular-nums">{stamp(pane.photo.captureDate)}</span>
          <span className="text-xs text-ink-secondary">{reviewWords(pane.review)}</span>
        </figcaption>
      </figure>)}
    </div>
    <p className="max-w-prose text-sm text-ink-secondary">Lighting and capture conditions may differ between photos. Originals at full resolution, no filtering applied.</p>
    {panes.some(pane => pane.original?.error) && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry originals</Button>}
  </section>;
}
