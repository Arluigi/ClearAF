import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoutineCareController, draftChanges, draftNotice, slotBadges, type RoutineEditorState } from '../src/lib/routine-care';
import { RoutineSlotEditor } from '../src/components/patients/workspace/RoutineSlotEditor';
import { RoutineVersionList } from '../src/components/patients/workspace/RoutineVersionList';
import { TemplateList } from '../src/components/care-support/TemplateList';
import type { RoutineRevision } from '../src/types/api';
import { read } from './letterpress-rules';

const saved: RoutineRevision = { id: 'rev-4', userId: 'p', timeOfDay: 'morning', version: 4, createdBy: 'c', createdAt: '2026-09-02T09:00:00', name: 'Morning routine', isActive: true, steps: [
  { title: 'Gentle cleanser', instructions: 'Lukewarm water' },
  { title: 'Adapalene 0.1%', instructions: 'Every night' },
  { title: 'SPF 30', instructions: '' },
] };
const editor = (over: Partial<RoutineEditorState> = {}): RoutineEditorState => ({
  routine: saved, draft: { name: saved.name, isActive: true, steps: saved.steps.map(step => ({ ...step })) },
  expectedRevisionId: saved.id, status: 'ready', error: '', dirty: false, hasPendingSave: false, ...over,
});
const controller = () => new RoutineCareController({
  fetchSnapshot: async () => ({ routines: [saved], completions: [] }),
  saveRevision: async () => { throw new Error('offline'); },
  fetchHistory: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
});
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;
const noop = () => {};

test('draft changes spell out what each edited step was', () => {
  const draft = { name: 'Morning routine, reduced', isActive: false, steps: [
    { title: 'Gentle cleanser', instructions: 'Lukewarm water' },
    { title: 'Adapalene 0.1%', instructions: 'Three nights a week' },
    { title: 'Moisturizer', instructions: '' },
    { title: 'Reapply SPF', instructions: '' },
  ] };
  const changes = draftChanges(saved, draft);
  assert.deepEqual(changes.steps, [{ kind: 'same' }, { kind: 'edited', was: 'Every night' }, { kind: 'edited', was: 'SPF 30' }, { kind: 'new' }]);
  assert.deepEqual([changes.name, changes.active, changes.removed, changes.count], ['Morning routine', true, 0, 5]);
  assert.equal(draftChanges(saved, { ...draft, steps: draft.steps.slice(0, 1) }).removed, 2);
  assert.deepEqual(draftChanges(saved, { name: saved.name, isActive: true, steps: [saved.steps[0], saved.steps[1], { title: 'SPF 30', instructions: 'Reapply midday' }] }).steps[2], { kind: 'edited', was: 'no instructions' });
  assert.equal(draftChanges(saved, { name: saved.name, isActive: true, steps: [{ title: 'x'.repeat(60), instructions: '' }] }).steps[0].kind, 'edited');
  assert.equal((draftChanges({ ...saved, steps: [{ title: 'y'.repeat(60), instructions: '' }] }, { name: saved.name, isActive: true, steps: [{ title: 'z', instructions: '' }] }).steps[0] as { was: string }).was.length, 48);
});

test('badges and notice state the active version, the draft, and that the patient stays on it until save', () => {
  assert.deepEqual(slotBadges(editor()).map(b => b.label), ['V4 active']);
  assert.deepEqual(slotBadges(editor({ dirty: true })).map(b => b.label), ['V4 active', 'Draft v5']);
  assert.deepEqual(slotBadges(editor({ routine: null, dirty: true })).map(b => b.label), ['Not assigned', 'Draft v1']);
  assert.equal(draftNotice('Ada', editor({ dirty: true })), 'Ada keeps following v4 until v5 is saved.');
  assert.equal(draftNotice('Ada', editor({ routine: null })), 'Nothing is assigned to Ada until v1 is saved.');
  assert.equal(draftNotice('', editor({ routine: { ...saved, isActive: false } })), 'The patient has no active routine in this slot until v5 is saved.');
});

test('discard restores the saved version and is refused while a save is unresolved', async () => {
  const routines = controller();
  await routines.load();
  routines.setStepInstructions('morning', 1, 'Three nights a week');
  routines.discard('morning');
  assert.deepEqual([routines.snapshot().slots.morning.dirty, routines.snapshot().slots.morning.draft.steps[1].instructions], [false, 'Every night']);
  routines.setStepInstructions('morning', 1, 'Three nights a week');
  await routines.save('morning');
  assert.equal(routines.snapshot().slots.morning.hasPendingSave, true);
  routines.discard('morning');
  assert.equal(routines.snapshot().slots.morning.draft.steps[1].instructions, 'Three nights a week');
});

test('slot editor: edited step tinted with its previous value, V4 active and Draft v5, Save as v5 as the one filled action', () => {
  const draftEditor = editor({ dirty: true, draft: { name: saved.name, isActive: true, steps: [saved.steps[0], { title: 'Adapalene 0.1%', instructions: 'Three nights a week' }, saved.steps[2]] } });
  const html = renderToStaticMarkup(h(RoutineSlotEditor, { slot: 'morning', editor: draftEditor, controller: controller(), primary: true, patientFirstName: 'Ada', onReloadConflict: noop, onFeedback: noop }));
  assert.equal((html.match(/data-edited="true"/g) ?? []).length, 1);
  assert.match(html, /data-edited="true" class="[^"]*bg-attention-wash/);
  assert.match(html, /Edited · was “Every night”/);
  assert.match(html, />V4 active</); assert.match(html, />Draft v5</);
  assert.match(html, />Save as v5</); assert.equal(filled(html), 1);
  assert.match(html, /Ada keeps following v4 until v5 is saved\./);
  assert.match(html, />1 unsaved change</);
  assert.match(html, />01</); assert.match(html, />03</);
  assert.match(html, />Send feedback about v4</);
  const empty = renderToStaticMarkup(h(RoutineSlotEditor, { slot: 'evening', editor: editor({ routine: null, draft: { name: '', isActive: true, steps: [] } }), controller: controller(), primary: false, patientFirstName: 'Ada', onReloadConflict: noop, onFeedback: noop }));
  assert.equal(filled(empty), 0);
  assert.match(empty, />Not assigned</);
  assert.match(empty, /No steps yet\. Add at least one step before activating, or start from a template\./);
});

test('version history lists saved versions newest first, and says so plainly when the server is older', () => {
  const ready = renderToStaticMarkup(h(RoutineVersionList, { slot: 'morning', page: 1, onPage: noop, onRetry: noop, state: { status: 'ready', page: { data: [saved, { ...saved, id: 'rev-3', version: 3, isActive: false, createdAt: '2026-08-12T09:00:00' }], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } } } }));
  assert.match(ready, /Version history · morning/); assert.match(ready, />V4</); assert.match(ready, />V3</);
  assert.match(ready, /02 SEP/); assert.match(ready, /Morning routine · archived/); assert.match(ready, /1 · Gentle cleanser/);
  assert.match(renderToStaticMarkup(h(RoutineVersionList, { slot: 'evening', page: 1, onPage: noop, onRetry: noop, state: { status: 'unsupported' } })), /Earlier versions are not available from this server yet\./);
  assert.match(renderToStaticMarkup(h(RoutineVersionList, { slot: 'evening', page: 1, onPage: noop, onRetry: noop, state: { status: 'ready', page: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } } })), /No saved versions yet\./);
});

test('templates beside the editor copy into a chosen slot and are blocked for a slot with an unresolved save', () => {
  const html = renderToStaticMarkup(h(TemplateList, { templates: [{ id: 't', revisionId: 'tr', version: 5, name: 'Tretinoin ramp', steps: [saved.steps[0], saved.steps[1]], isActive: true, updatedAt: '2026-08-28T00:00:00' }], disabled: { morning: true, evening: false }, onCopy: noop }));
  assert.match(html, /Tretinoin ramp/); assert.match(html, /V5 · 2 steps/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Use in morning<\/button>/);
  assert.match(html, /<button(?![^>]*disabled="")[^>]*>Use in evening<\/button>/);
  assert.match(renderToStaticMarkup(h(TemplateList, { templates: [], disabled: { morning: false, evening: false }, onCopy: noop })), /No active templates on this page\./);
});

test('the routine tab places templates and version history beside the two panes and links feedback to the Messages tab', () => {
  const source = read('src/components/patients/PatientRoutineCare.tsx');
  assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_16rem\]/);
  assert.match(source, /<TemplatePicker /); assert.match(source, /<RoutineVersionHistory /);
  assert.match(read('src/components/patients/workspace/RoutineVersionHistory.tsx'), /loadRevisionHistory\(\(\) => api\.getPatientRoutineRevisions\(patientId, slot, page\)\)/);
  assert.match(read('src/app/patients/[id]/page.tsx'), /openTab\('messages', \{ referenceType: 'routineRevision', referenceId: revisionId \}\)/);
});
