'use client';
import { RefreshCw } from 'lucide-react';
import TemplatePicker from '@/components/care-support/TemplatePicker';
import { Button } from '@/components/ui/button';
import type { RoutineCareController, RoutineCareState } from '@/lib/routine-care';
import { firstName } from '@/lib/workspace';
import RoutineVersionHistory from './workspace/RoutineVersionHistory';
import { RoutineSlotEditor } from './workspace/RoutineSlotEditor';

const SLOTS = ['morning', 'evening'] as const;

export default function PatientRoutineCare({ patientId, patientName, controller, state, onFeedback }: {
  patientId: string; patientName: string; controller: RoutineCareController; state: RoutineCareState; onFeedback: (revisionId: string) => void;
}) {
  const saving = SLOTS.some(slot => state.slots[slot].status === 'saving');
  const drafting = SLOTS.some(slot => state.slots[slot].dirty || state.slots[slot].hasPendingSave);
  // One filled action on the tab: the first slot with a draft.
  const primarySlot = SLOTS.find(slot => state.slots[slot].dirty) ?? null;
  return <section aria-label="Patient routine care" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <p className="eyebrow">Routine</p>
        <h2 className="editorial-title text-[32px]">Assigned routines</h2>
        <p className="max-w-prose text-sm text-ink-secondary">Saving creates a new version. Earlier versions and the completions recorded against them keep their own record.</p>
      </div>
      <div className="space-y-1 text-right">
        <Button type="button" variant="outline" size="sm" disabled={saving || drafting || state.loadStatus === 'loading'} onClick={() => void controller.load()}><RefreshCw aria-hidden />Refresh assignments</Button>
        {drafting && state.loadStatus === 'ready' && <p className="text-xs text-ink-secondary">Save or discard open drafts to refresh.</p>}
      </div>
    </div>
    {state.loadStatus === 'loading' && <p role="status" className="text-sm text-ink-secondary">Loading routine assignments</p>}
    {state.loadStatus === 'error' && <div role="alert" className="space-y-2"><p className="text-sm">{state.loadError}</p><Button type="button" variant="outline" size="sm" onClick={() => void controller.load()}>Retry assignments</Button></div>}
    {state.loadStatus === 'ready' && <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem]">
      {SLOTS.map(slot => <RoutineSlotEditor key={slot} slot={slot} editor={state.slots[slot]} controller={controller} primary={primarySlot === slot} patientFirstName={firstName(patientName)} onReloadConflict={() => void controller.reloadConflict(slot)} onFeedback={onFeedback} />)}
      <aside aria-label="Templates and version history" className="space-y-8">
        <TemplatePicker
          disabled={{ morning: state.slots.morning.hasPendingSave, evening: state.slots.evening.hasPendingSave }}
          dirty={{ morning: state.slots.morning.dirty, evening: state.slots.evening.dirty }}
          onCopy={(slot, template) => controller.copyTemplate(slot, template)}
        />
        {SLOTS.map(slot => <RoutineVersionHistory key={`${slot}-${state.slots[slot].routine?.id ?? 'none'}`} patientId={patientId} slot={slot} />)}
      </aside>
    </div>}
  </section>;
}
