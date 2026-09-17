'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { answerText, type CheckInResponse } from '@/lib/care-support';
import type { RoutineCareState } from '@/lib/routine-care';
import { day } from '@/lib/worklist';

// Keeps the current routine and latest check-in visible while writing feedback (spec §6 portal #2).
export function CareRailView({ routine, latest, checkInStatus, onRetry, onOpen }: {
  routine: RoutineCareState; latest: CheckInResponse | null; checkInStatus: 'loading' | 'ready' | 'error';
  onRetry: () => void; onOpen: (tab: 'routine' | 'check-ins') => void;
}) {
  return <div className="space-y-8">
    <section aria-label="Current routine" className="space-y-3 border-t border-rule pt-5">
      <p className="eyebrow">Current routine</p>
      {routine.loadStatus === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading routine</p>}
      {routine.loadStatus === 'error' && <p role="alert" className="text-sm">{routine.loadError}</p>}
      {routine.loadStatus === 'ready' && (['morning', 'evening'] as const).map(slot => {
        const saved = routine.slots[slot].routine;
        return <div key={slot} className="space-y-1.5">
          <p className="flex items-baseline gap-2 text-[15px] font-medium">{slot === 'morning' ? 'Morning routine' : 'Evening routine'}{saved && <span className="meta-mono">V{saved.version}</span>}{saved && !saved.isActive && <span className="text-xs font-normal text-ink-secondary">archived</span>}</p>
          {!saved ? <p className="text-sm text-ink-secondary">Not assigned.</p>
            : <ol className="space-y-1 text-sm">{saved.steps.map((step, index) => <li key={index}><span className="font-data text-xs tabular-nums text-ink-tertiary">{index + 1}</span> · {step.title}</li>)}</ol>}
        </div>;
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen('routine')}>Edit routine</Button>
    </section>
    <section aria-label="Latest check-in" className="space-y-3 border-t border-rule pt-5">
      <p className="eyebrow">{latest ? `Latest check-in · ${day(latest.submittedAt)}` : 'Latest check-in'}</p>
      {checkInStatus === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading check-ins</p>}
      {checkInStatus === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">Check-ins could not be loaded.</p><Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>}
      {checkInStatus === 'ready' && !latest && <p className="text-sm text-ink-secondary">No check-ins submitted yet.</p>}
      {latest && <dl className="space-y-2 text-sm">{latest.form.questions.slice(0, 4).map(question => <div key={question.id}>
        <dt className="text-ink-secondary">{question.prompt}</dt>
        <dd className="font-medium">{answerText(question, latest)}</dd>
      </div>)}</dl>}
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen('check-ins')}>All check-ins</Button>
    </section>
  </div>;
}
