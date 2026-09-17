'use client';
import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { draftChanges, draftNotice, slotBadges, type RoutineCareController, type RoutineEditorState } from '@/lib/routine-care';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/worklist';
import type { RoutineTimeOfDay } from '@/types/api';

export function RoutineSlotEditor({ slot, editor, controller, primary, patientFirstName, onReloadConflict, onFeedback }: {
  slot: RoutineTimeOfDay; editor: RoutineEditorState; controller: RoutineCareController; primary: boolean;
  patientFirstName: string; onReloadConflict: () => void; onFeedback: (revisionId: string) => void;
}) {
  const label = slot === 'morning' ? 'Morning' : 'Evening';
  const lower = label.toLowerCase();
  const locked = editor.hasPendingSave;
  const saving = editor.status === 'saving';
  const tracked = editor.routine !== null;
  const changes = draftChanges(editor.routine, editor.draft);
  const next = (editor.routine?.version ?? 0) + 1;
  const dirtyText = !editor.dirty ? 'No unsaved changes'
    : !tracked ? 'Unsaved draft'
      : changes.count === 0 ? `Draft matches v${editor.routine?.version}` : plural(changes.count, 'unsaved change');

  return <section aria-label={`${label} routine editor`} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2">
      <h3 className="text-[17px] font-medium">{label} routine</h3>
      <div className="flex flex-wrap gap-1.5">{slotBadges(editor).map(badge => <Badge key={badge.label} variant={badge.variant}>{badge.label}</Badge>)}</div>
    </div>

    <div className="space-y-1.5">
      <Label htmlFor={`${slot}-routine-name`}>Routine name</Label>
      <Input id={`${slot}-routine-name`} aria-label={`${label} routine name`} value={editor.draft.name} maxLength={120} disabled={locked} placeholder={`${label} routine`} onChange={event => controller.setName(slot, event.target.value)} />
      {tracked && changes.name !== null && <p className="meta-mono">Edited · was “{changes.name}”</p>}
    </div>

    <div className="flex items-center justify-between gap-4 border-y border-rule py-3">
      <div className="space-y-0.5">
        <label htmlFor={`${slot}-active`} className="text-sm font-medium">Active assignment</label>
        <p className="text-xs text-ink-secondary">Turn off and save to archive this routine.</p>
        {tracked && changes.active !== null && <p className="meta-mono">Edited · was {changes.active ? 'active' : 'archived'}</p>}
      </div>
      <Switch id={`${slot}-active`} aria-label={`${label} routine active`} checked={editor.draft.isActive} disabled={locked} onCheckedChange={checked => controller.setActive(slot, checked)} />
    </div>

    <div className="flex items-center justify-between gap-2">
      <p className="eyebrow">Ordered steps · {editor.draft.steps.length}</p>
      <Button type="button" variant="outline" size="sm" disabled={locked || editor.draft.steps.length >= 20} onClick={() => controller.addStep(slot)}><Plus aria-hidden />Add step</Button>
    </div>
    {editor.draft.steps.length === 0
      ? <p className="text-sm text-ink-secondary">No steps yet. Add at least one step before activating, or start from a template.</p>
      : <ol className="divide-y divide-rule border-y border-rule">{editor.draft.steps.map((step, index) => {
        const change = changes.steps[index];
        const marked = tracked && change.kind !== 'same';
        // Inside the attention wash, secondary ink replaces ink.tertiary (4.28:1 there in dark mode).
        const quiet = marked ? 'text-ink-secondary' : undefined;
        return <li key={index} data-edited={marked || undefined} className={cn('grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 px-2 py-3', marked && 'bg-attention-wash')}>
          <span className="pt-6 font-data text-xs font-medium tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${slot}-step-${index}-title`} className={quiet}>Step title</Label>
            <Input id={`${slot}-step-${index}-title`} aria-label={`${label} step ${index + 1} title`} value={step.title} maxLength={120} disabled={locked} className={cn(marked && 'placeholder:text-ink-secondary')} onChange={event => controller.setStepTitle(slot, index, event.target.value)} />
            <Label htmlFor={`${slot}-step-${index}-instructions`} className={cn('block pt-2', quiet)}>Instructions</Label>
            <Textarea id={`${slot}-step-${index}-instructions`} aria-label={`${label} step ${index + 1} instructions`} value={step.instructions} maxLength={2000} disabled={locked} className="min-h-16" onChange={event => controller.setStepInstructions(slot, index, event.target.value)} />
            {marked && <p className={cn('meta-mono', quiet)}>{change.kind === 'edited' ? `Edited · was “${change.was}”` : 'New step'}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${lower} step ${index + 1} up`} disabled={locked || index === 0} onClick={() => controller.moveStep(slot, index, index - 1)}><ArrowUp aria-hidden /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Move ${lower} step ${index + 1} down`} disabled={locked || index === editor.draft.steps.length - 1} onClick={() => controller.moveStep(slot, index, index + 1)}><ArrowDown aria-hidden /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${lower} step ${index + 1}`} disabled={locked} onClick={() => controller.removeStep(slot, index)}><X aria-hidden /></Button>
          </div>
        </li>;
      })}</ol>}
    {tracked && changes.removed > 0 && <p className="meta-mono">{plural(changes.removed, 'step')} removed</p>}

    {editor.error && <div role="alert" className="space-y-2 border-l-2 border-error pl-3">
      <p className="text-sm text-error">{editor.error}</p>
      {editor.status === 'conflict'
        ? <Button type="button" variant="outline" size="sm" disabled={!controller.canReloadConflict(slot)} onClick={onReloadConflict}>Reload assignments</Button>
        : editor.hasPendingSave ? <Button type="button" variant="outline" size="sm" onClick={() => void controller.retry(slot)}>Retry the same save</Button> : null}
    </div>}

    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={primary ? 'default' : 'outline'} disabled={saving || locked || !editor.dirty} onClick={() => void controller.save(slot)}>{saving ? `Saving v${next}…` : `Save as v${next}`}</Button>
      <Button type="button" variant="outline" disabled={locked || !editor.dirty} onClick={() => controller.discard(slot)}>Discard draft</Button>
      <p role="status" className="text-sm text-ink-secondary">{dirtyText}</p>
    </div>
    <p className="max-w-prose text-sm text-ink-secondary">{draftNotice(patientFirstName, editor)}</p>
    {editor.routine && <Button type="button" variant="link" size="sm" className="px-0" onClick={() => onFeedback(editor.routine!.id)}>Send feedback about v{editor.routine.version}</Button>}
  </section>;
}
