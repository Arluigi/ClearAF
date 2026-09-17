'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { RevisionHistory } from '@/lib/routine-care';
import { day } from '@/lib/worklist';
import type { RoutineTimeOfDay } from '@/types/api';

export type VersionListState = { status: 'loading' } | { status: 'error' } | RevisionHistory;

export function RoutineVersionList({ slot, state, page, onPage, onRetry }: { slot: RoutineTimeOfDay; state: VersionListState; page: number; onPage: (page: number) => void; onRetry: () => void }) {
  const label = slot === 'morning' ? 'Morning' : 'Evening';
  return <section aria-label={`${label} version history`} className="space-y-2">
    <p className="eyebrow">Version history · {slot}</p>
    {state.status === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading versions</p>}
    {state.status === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">Versions could not be loaded.</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>}
    {state.status === 'unsupported' && <p className="text-sm text-ink-secondary">Earlier versions are not available from this server yet.</p>}
    {state.status === 'ready' && (state.page.data.length === 0
      ? <p className="text-sm text-ink-secondary">No saved versions yet.</p>
      : <ol className="divide-y divide-rule border-y border-rule">{state.page.data.map(revision => <li key={revision.id} className="py-2">
        <details>
          <summary className="grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-sm">
            <span className="font-data text-xs font-medium tabular-nums">V{revision.version}</span>
            <span className="min-w-0 truncate">{revision.name}{revision.isActive ? '' : ' · archived'}</span>
            <span className="meta-mono">{day(revision.createdAt)}</span>
          </summary>
          <ol className="mt-2 space-y-1 pl-10 text-sm text-ink-secondary">{revision.steps.length
            ? revision.steps.map((step, index) => <li key={index}>{index + 1} · {step.title}</li>)
            : <li>No steps</li>}</ol>
        </details>
      </li>)}</ol>)}
    {state.status === 'ready' && state.page.pagination.totalPages > 1 && <nav aria-label={`${label} version pages`} className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Newer</Button>
      <span className="meta-mono">Page {page} of {state.page.pagination.totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= state.page.pagination.totalPages} onClick={() => onPage(page + 1)}>Older</Button>
    </nav>}
  </section>;
}
