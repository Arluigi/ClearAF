import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorklistView from '../src/components/patients/worklist/WorklistView';
import type { WorklistFilter, WorklistQuery, WorklistResponse, WorklistRow } from '../src/types/api';
import type { WorklistState } from '../src/lib/worklist';
import { classesOf } from './letterpress-rules';

const NOW = new Date(2026, 8, 16, 8, 40);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const row = (over: Partial<WorklistRow>): WorklistRow => ({
  patientId: 'patient-a', name: 'Synthetic Ada', joinedAt: new Date(2026, 2, 2, 12).toISOString(),
  photos: { unreviewedCount: 0, oldestUploadAt: null }, unreadMessages: 0, latestCheckInAt: null,
  urgent: { open: 0, acknowledged: 0, oldestAt: null }, adherence: null, ...over,
});
const result = (data: WorklistRow[], filter: WorklistFilter = 'needs-review'): WorklistResponse => ({
  filter, localDate: '2026-09-16',
  summary: {
    assignedPatients: 14, photosToReview: { count: 7, oldestUploadAt: hoursAgo(96) }, unreadMessages: { count: 3, patients: 2 },
    checkInsSubmitted: { count: 5, since: hoursAgo(168), days: 7 }, adherenceUnderThreshold: { count: 2, threshold: 60, windowDays: 14 },
  },
  data, pagination: { page: 1, limit: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});
const state = (over: Partial<WorklistState>): WorklistState => ({ filter: 'needs-review', page: 1, search: '', status: 'ready', result: null, query: null, checkedAt: NOW, ...over });
const render = (value: WorklistState) => renderToStaticMarkup(h(WorklistView, { state: value, now: NOW, onFilter() {}, onSearch() {}, onPage() {}, onRetry() {} }));
// Tag-stripped text, for assertions on wording where the exact markup (spans wrapping mono figures,
// nested links, …) isn't what's under test.
const textOf = (html: string) => html.replace(/<[^>]+>/g, '');
const waiting = row({
  photos: { unreviewedCount: 3, oldestUploadAt: hoursAgo(96) }, unreadMessages: 1,
  adherence: { percent: 79, completedDays: 11, countedDays: 14, days: [1, 2, 0, 2, 2, 1, 0, 2, 2, 1, 2, 0, 2, 2].map((routines, i) => ({ localDate: `2026-09-${String(3 + i).padStart(2, '0')}`, routines: routines as 0 | 1 | 2 })) },
});
const quiet = row({ patientId: 'patient-b', name: 'Synthetic Ben', latestCheckInAt: new Date(2026, 8, 15, 7, 4).toISOString() });
const actionLinks = (html: string) => [...html.matchAll(/<a [^>]*href="\/patients\/[^"]*"[^>]*>/g)].map((match) => match[0]);

test('loading keeps the layout: count labels, placeholders and a named loading line', () => {
  const html = render(state({ status: 'loading', result: null, checkedAt: null }));
  for (const text of ['Wednesday 16 September · 08:40', 'Needs you today', 'Photos to review', 'Unread messages', 'Check-ins submitted', 'Adherence under 60%', 'Loading worklist', '–']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<table/);
});

test('populated: four real counts, one merged table, exactly one filled action per row, attention only on waiting rows', () => {
  const html = render(state({ result: result([waiting, quiet]) }));
  assert.ok(html.includes('>7<'), '>7<');
  const text = textOf(html);
  for (const t of ['Oldest waiting 4 days', '2 patients', 'Last 7 days', '14-day window', '2 OF 14', 'Synthetic Ada', 'Since 02 MAR', '3 photos', 'Oldest 4D', '79% / 14d', '1 unread message', 'No photos waiting', 'No active routine', 'Check-in · 15 SEP · 07:04', 'Sorted by oldest unreviewed upload', 'PAGE 1 / 1'])
    assert.ok(text.includes(t), t);
  // The mono figures inside those lines are wrapped for font-data tabular-nums (spec §4.9).
  for (const mono of ['4', '2', '7', '14', '15 SEP', '07:04'])
    assert.ok(html.includes(`<span class="font-data tabular-nums">${mono}</span>`), mono);
  const links = actionLinks(html);
  assert.equal(links.length, 2);
  for (const link of links) assert.ok(classesOf(link).has('bg-ink'), link);
  assert.ok(links[0].includes('href="/patients/patient-a?page=1"'));
  assert.ok(links[0].includes('Review photos for Synthetic Ada'));
  assert.equal(html.match(/data-attention="true"/g)?.length, 1);
  assert.equal(html.match(/data-day=/g)?.length, 14);
  assert.equal(html.match(/text-attention-text/g)?.length, 1);
});

test('flagged rows open the urgent report and keep the not-a-live-alert note', () => {
  const report = row({ patientId: 'patient-b', name: 'Synthetic Ben', urgent: { open: 1, acknowledged: 0, oldestAt: hoursAgo(20) } });
  const html = render(state({ filter: 'flagged', result: result([report], 'flagged') }));
  const text = textOf(html);
  for (const t of ['This is not a live alert.', 'Urgent report · 1 open', 'Open report', 'Oldest open report first']) assert.ok(text.includes(t), t);
  assert.ok(html.includes('href="/patients/patient-b?page=1&amp;filter=flagged#urgent"'));
});

test('row links follow the query that produced the loaded result, not the in-flight typed search', () => {
  const query: WorklistQuery = { filter: 'needs-review', page: 1, search: 'Ada', localDate: '2026-09-16' };
  // The clinician has typed further ("Adam") but the rows on screen — and their links — still match
  // the last completed request ("Ada") while that keystroke's reload is still debouncing.
  const html = render(state({ search: 'Adam', result: result([waiting]), query }));
  const links = actionLinks(html);
  assert.equal(links.length, 1);
  assert.ok(links[0].includes('href="/patients/patient-a?page=1&amp;search=Ada"'), links[0]);
});

test('empty states: display-serif title, one sentence, one action', () => {
  let html = render(state({ result: result([]) }));
  assert.ok(html.includes('No photos waiting') && html.includes('Show all patients'));
  assert.match(html, /<h2 class="[^"]*editorial-title[^"]*">No photos waiting<\/h2>/);
  assert.equal(actionLinks(html).length, 0);
  html = render(state({ search: 'Zed', result: result([]) }));
  assert.ok(html.includes('No patients match this name') && html.includes('Clear search'));
});

test('error keeps the last result and offers a retry of the same load', () => {
  const html = render(state({ status: 'error', result: result([waiting]) }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Couldn(?:&#x27;|')t load the worklist/);
  assert.ok(html.includes('Last checked 08:40') && html.includes('Try again'));
  assert.match(html, /<table/);
});

test('rows from another filter are never shown under the selected tab', () => {
  const html = render(state({ filter: 'flagged', status: 'loading', result: result([waiting]) }));
  assert.doesNotMatch(html, /<table/);
  assert.ok(html.includes('Loading worklist'));
});

test('a page past the end still shows the pager, even with zero rows, so the clinician can go back', () => {
  const empty = { ...result([]), pagination: { page: 2, limit: 20, total: 0, totalPages: 1 } };
  const html = render(state({ page: 2, result: empty }));
  assert.doesNotMatch(html, /<table/);
  assert.ok(html.includes('aria-label="Worklist pages"'));
  assert.ok(html.includes('Previous page'));
  assert.ok(html.includes('No photos waiting'));
});

test('a page-one empty state has no pager', () => {
  const html = render(state({ page: 1, result: result([]) }));
  assert.ok(!html.includes('aria-label="Worklist pages"'));
});

test('a disabled Refresh names why: loading', () => {
  let html = render(state({ status: 'loading', result: null, checkedAt: null }));
  assert.ok(html.includes('Loading…'));
  html = render(state({ result: result([waiting]) }));
  assert.ok(!html.includes('Loading…'));
});
