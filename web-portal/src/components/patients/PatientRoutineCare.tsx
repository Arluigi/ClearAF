'use client';

import TemplatePicker from '@/components/care-support/TemplatePicker';
import { ArrowDown, ArrowUp, ClipboardCheck, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { RoutineCareController, RoutineCareState, RoutineEditorState } from '@/lib/routine-care';
import type { RoutineTimeOfDay } from '@/types/api';

function RoutineEditor({
  slot,
  editor,
  controller,
  reload,
}: {
  slot: RoutineTimeOfDay;
  editor: RoutineEditorState;
  controller: RoutineCareController;
  reload: () => void;
}) {
  const title = slot === 'morning' ? 'Morning routine' : 'Evening routine';
  const label = slot === 'morning' ? 'Morning' : 'Evening';
  const locked = editor.hasPendingSave;
  const saving = editor.status === 'saving';

  return <Card aria-label={`${label} routine editor`}>
    <CardHeader className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={editor.routine?.isActive === false ? 'secondary' : 'outline'}>
            {editor.routine ? `Version ${editor.routine.version}` : 'Not assigned'}
          </Badge>
          {editor.routine?.isActive === false && <Badge variant="secondary">Archived</Badge>}
        </div>
      </div>
      {editor.routine && <a className="text-sm underline" href={"/messages?patient="+encodeURIComponent(editor.routine.userId)+"&referenceType=routineRevision&referenceId="+encodeURIComponent(editor.routine.id)}>Send feedback about this saved revision</a>}
      <CardDescription>Saving creates a new version for this patient.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <TemplatePicker disabled={locked} onCopy={template => controller.copyTemplate(slot, template)} />
      <div className="space-y-2">
        <Label htmlFor={`${slot}-routine-name`}>Routine name</Label>
        <Input
          id={`${slot}-routine-name`}
          aria-label={`${label} routine name`}
          value={editor.draft.name}
          maxLength={120}
          disabled={locked}
          onChange={event => controller.setName(slot, event.target.value)}
          placeholder={`${label} routine name`}
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <div className="space-y-1">
          <Label htmlFor={`${slot}-active`}>Active assignment</Label>
          <p className="text-sm text-ink-secondary">Turn this off and save to archive the routine.</p>
        </div>
        <Switch
          id={`${slot}-active`}
          aria-label={`${label} routine active`}
          checked={editor.draft.isActive}
          disabled={locked}
          onCheckedChange={checked => controller.setActive(slot, checked)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Ordered steps</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked || editor.draft.steps.length >= 20}
            onClick={() => controller.addStep(slot)}
          >
            <Plus className="mr-2 h-4 w-4" /> Add step
          </Button>
        </div>
        {editor.draft.steps.length === 0 ? <p className="text-sm text-ink-secondary">
          No steps. Add at least one step before activating this routine.
        </p> : editor.draft.steps.map((step, index) => <div key={index} className="space-y-3 border-t pt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">Step {index + 1}</p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move ${label.toLowerCase()} step ${index + 1} up`}
                disabled={locked || index === 0}
                onClick={() => controller.moveStep(slot, index, index - 1)}
              ><ArrowUp className="h-4 w-4" /></Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move ${label.toLowerCase()} step ${index + 1} down`}
                disabled={locked || index === editor.draft.steps.length - 1}
                onClick={() => controller.moveStep(slot, index, index + 1)}
              ><ArrowDown className="h-4 w-4" /></Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${label.toLowerCase()} step ${index + 1}`}
                disabled={locked}
                onClick={() => controller.removeStep(slot, index)}
              ><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${slot}-step-${index}-title`}>Title</Label>
            <Input
              id={`${slot}-step-${index}-title`}
              aria-label={`${label} step ${index + 1} title`}
              value={step.title}
              maxLength={120}
              disabled={locked}
              onChange={event => controller.setStepTitle(slot, index, event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${slot}-step-${index}-instructions`}>Instructions</Label>
            <Textarea
              id={`${slot}-step-${index}-instructions`}
              aria-label={`${label} step ${index + 1} instructions`}
              value={step.instructions}
              maxLength={2000}
              disabled={locked}
              onChange={event => controller.setStepInstructions(slot, index, event.target.value)}
            />
          </div>
        </div>)}
      </div>

      {editor.error && <div role="alert" className="space-y-2 rounded-none border border-error p-3 text-sm">
        <p>{editor.error}</p>
        {editor.status === 'conflict' ? <Button type="button" variant="outline" size="sm" disabled={!controller.canReloadConflict(slot)} onClick={reload}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reload assignments
        </Button> : editor.hasPendingSave ? <Button type="button" variant="outline" size="sm" onClick={() => void controller.retry(slot)}>
          Retry the same save
        </Button> : null}
      </div>}

      <p role="status" className="text-sm text-ink-secondary">{editor.dirty ? 'Unsaved changes' : 'No unsaved changes'}</p>
      <Button
        type="button"
        className="w-full"
        disabled={saving || locked || !editor.dirty}
        onClick={() => void controller.save(slot)}
      >
        {saving ? `Saving ${label.toLowerCase()} routine…` : `Save ${label.toLowerCase()} routine`}
      </Button>
    </CardContent>
  </Card>;
}

export default function PatientRoutineCare({ controller, state }: { controller: RoutineCareController; state: RoutineCareState }) {
  const reloadAssignments = () => { void controller.load(); };
  const reloadConflict = (slot: RoutineTimeOfDay) => { void controller.reloadConflict(slot); };
  const saving = state.slots.morning.status === 'saving' || state.slots.evening.status === 'saving';
  const reloadBlocked = saving || state.slots.morning.hasPendingSave || state.slots.evening.hasPendingSave;

  return <section aria-label="Patient routine care" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-medium"><ClipboardCheck className="h-4 w-4" /> Assigned routines</h2>
        <p className="mt-1 text-sm text-ink-secondary">Edit clinician-assigned morning and evening routines.</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={reloadBlocked || Object.values(state.slots).some(editor => editor.dirty) || state.loadStatus === 'loading'} onClick={reloadAssignments}>
        <RefreshCw className="mr-2 h-4 w-4" /> Refresh assignments
      </Button>
    </div>

    {state.loadStatus === 'loading' && <p role="status">Loading routine assignments…</p>}
    {state.loadStatus === 'error' && <div role="alert" className="space-y-2">
      <p>{state.loadError}</p>
      <Button type="button" variant="outline" onClick={reloadAssignments}>Retry assignments</Button>
    </div>}
    {state.loadStatus === 'ready' && <div className="grid items-start gap-6 lg:grid-cols-2">
      <RoutineEditor slot="morning" editor={state.slots.morning} controller={controller} reload={() => reloadConflict('morning')} />
      <RoutineEditor slot="evening" editor={state.slots.evening} controller={controller} reload={() => reloadConflict('evening')} />
    </div>}
  </section>;
}
