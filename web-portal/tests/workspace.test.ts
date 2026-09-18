import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TAB_LABEL, WORKSPACE_TABS, firstName, sinceLabel, workspaceHref, workspaceTab } from '../src/lib/workspace';
import { messageReference } from '../src/lib/assigned-messaging';
import { splitReports, type UrgentReport } from '../src/lib/urgent-reports';
import WorkspaceHeader from '../src/components/patients/workspace/WorkspaceHeader';
import { LoadState } from '../src/components/care-support/shared';
import { read } from './letterpress-rules';

const noop = () => {};

test('tabs are Photos · Routine · Check-ins · Messages · History and default to Photos', () => {
  assert.deepEqual(WORKSPACE_TABS.map(tab => TAB_LABEL[tab]), ['Photos', 'Routine', 'Check-ins', 'Messages', 'History']);
  assert.equal(workspaceTab(new URLSearchParams('')), 'photos');
  assert.equal(workspaceTab(new URLSearchParams('tab=check-ins')), 'check-ins');
  assert.equal(workspaceTab(new URLSearchParams('tab=javascript:alert(1)')), 'photos');
});

test('workspace links keep the worklist context, omit the default tab and carry only known keys', () => {
  const href = workspaceHref('patient a', 'page=2&search=Ada&filter=flagged', 'routine');
  const [path, query] = href.split('?');
  assert.equal(path, '/patients/patient%20a');
  const params = new URLSearchParams(query);
  assert.deepEqual([params.get('page'), params.get('search'), params.get('filter'), params.get('tab')], ['2', 'Ada', 'flagged', 'routine']);
  assert.equal(new URLSearchParams(workspaceHref('p', 'page=1', 'photos').split('?')[1]).has('tab'), false);
  const linked = new URLSearchParams(workspaceHref('p', 'page=1', 'messages', { referenceType: 'photo', referenceId: 'x' }).split('?')[1]);
  assert.deepEqual([linked.get('tab'), linked.get('referenceType'), linked.get('referenceId')], ['messages', 'photo', 'x']);
});

test('message references from the URL accept only photo or routine revision UUIDs', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.deepEqual(messageReference('photo', id), { type: 'photo', id });
  assert.deepEqual(messageReference('routineRevision', id), { type: 'routineRevision', id });
  assert.equal(messageReference('appointment', id), null);
  assert.equal(messageReference('photo', '../x'), null);
  assert.equal(messageReference(null, null), null);
});

test('since label is a mono stamp with the year; first name falls back to empty', () => {
  assert.equal(sinceLabel(new Date(2026, 2, 2, 12).toISOString()), 'Since 02 MAR 2026');
  assert.equal(sinceLabel(undefined), '');
  assert.equal(sinceLabel('not a date'), '');
  assert.equal(firstName('  Synthetic   Ada '), 'Synthetic');
  assert.equal(firstName(''), '');
  assert.equal(firstName(null), '');
});

test('workspace header: serif name, mono since line, one outlined Message action and no filled button', () => {
  const html = renderToStaticMarkup(h(WorkspaceHeader, { name: 'Synthetic Ada', since: 'Since 02 MAR 2026', onMessage: noop }));
  assert.match(html, /<h1 class="[^"]*editorial-title[^"]*">Synthetic Ada<\/h1>/);
  assert.match(html, /class="meta-mono">Since 02 MAR 2026</);
  assert.match(html, />Message<\/button>/);
  assert.doesNotMatch(html, /bg-ink text-canvas/);
  assert.match(renderToStaticMarkup(h(WorkspaceHeader, { name: '', since: '', onMessage: noop })), />Unnamed patient</);
});

test('loading states name what is loading', () => {
  assert.match(renderToStaticMarkup(h(LoadState, { status: 'loading', error: '', retry: noop, loading: 'Loading photos' })), /role="status"[^>]*>Loading photos</);
  assert.match(renderToStaticMarkup(h(LoadState, { status: 'error', error: 'Could not load this record.', retry: noop })), /Could not load this record\.[\s\S]*>Retry</);
});

test('urgent reports: unresolved first, resolved folded away, words only', () => {
  const report = (id: string, status: UrgentReport['status']): UrgentReport => ({ id, patientId: 'p', category: 'other', description: 'Synthetic', status, createdAt: '2026-09-15T00:00:00.000Z', acknowledgedAt: null, resolvedAt: null, resolutionNote: null });
  const split = splitReports([report('a', 'resolved'), report('b', 'open'), report('c', 'acknowledged')]);
  assert.deepEqual([split.active.map(r => r.id), split.resolved.map(r => r.id)], [['b', 'c'], ['a']]);
  const urgent = read('src/components/patients/PatientUrgentReports.tsx');
  assert.match(urgent, /id="urgent"/);
  assert.match(urgent, /window\.location\.hash !== '#urgent'/);
  // Scrolls once (a ref guard), not on every data refetch after an acknowledge/resolve action.
  assert.match(urgent, /const scrolled = useRef\(false\);/);
  assert.match(urgent, /if \(scrolled\.current \|\| !result\.data \|\| window\.location\.hash !== '#urgent'\) return;/);
  assert.match(urgent, /scrolled\.current = true;/);
  assert.doesNotMatch(urgent, /AlertTriangle|attention-|'destructive'/);
  assert.doesNotMatch(read('src/components/patients/EnrollmentStatus.tsx'), /AlertTriangle|border-error/);
});

test('the workspace page is tabbed, URL-addressed, keeps visited tabs mounted and returns to the worklist context', () => {
  const page = read('src/app/patients/[id]/page.tsx');
  assert.ok(page.includes("'/patients?' + patientListQuery(context.page, context.search, context.filter)"));
  assert.match(page, /<TabsList variant="underline"/);
  assert.match(page, /activationMode="manual"/);
  assert.match(page, /window\.history\.pushState\(null, '', workspaceHref\(id, listQuery, next, extra\)\)/);
  assert.match(page, /forceMount className="mt-6 data-\[state=inactive\]:hidden">\{visited\.has\(value\) && content\}/);
  for (const tab of WORKSPACE_TABS) assert.ok(page.includes(`panel('${tab}'`), tab);
  assert.match(page, /<PatientUrgentReports key=\{'urgent-' \+ id\} patientId=\{id\} \/>\s*<Tabs/);
  for (const component of ['<PatientPhotoHistory', '<PatientRoutineCare', '<PatientCheckIns', '<ConversationView', '<CareStatusCard', '<CompletionCalendar', '<RoutineCompletionHistory']) assert.ok(page.includes(component), component);
  assert.doesNotMatch(page, /href=\{"\/messages\?patient=/);
  assert.doesNotMatch(read('src/components/patients/PatientRoutineCare.tsx'), /new RoutineCareController|CompletionCalendar|Recent completion events/);
});

test('sidebar is a 200px rail: Worklist, Messages, Templates, Account; the lockup heads it', () => {
  const sidebar = read('src/components/layout/Sidebar.tsx');
  assert.match(sidebar, /w-\[200px\]/);
  assert.deepEqual([...sidebar.matchAll(/name: '([^']+)'/g)].map(match => match[1]), ['Worklist', 'Messages', 'Templates', 'Account']);
  assert.doesNotMatch(sidebar, /Stethoscope/);
  assert.match(sidebar, /<Lockup height=\{LOCKUP_HEIGHT\.rail\}/);
});

test('eyebrow, mono metadata and the photo mat are defined once in globals.css', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.eyebrow\s*{[^}]*font-size:\s*10px;[^}]*letter-spacing:\s*0\.16em;[^}]*text-transform:\s*uppercase;/);
  assert.match(css, /\.meta-mono\s*{[^}]*font-size:\s*11px;[^}]*font-variant-numeric:\s*tabular-nums;/);
  assert.match(css, /\.photo-mat\s*{\s*background-color:\s*rgb\(18 19 18\);\s*color:\s*rgb\(242 239 231\);\s*}/);
});
