import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIError } from '../src/types/api';
import type { WorklistFilter, WorklistQuery, WorklistResponse, WorklistRow } from '../src/types/api';
import { WorklistController, activity, adherenceText, dayBar, emptyCopy, localDateOf, longDate, rowAction, stamp, summaryTiles, waited } from '../src/lib/worklist';

const NOW = new Date(2026, 8, 16, 8, 40);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const summary: WorklistResponse['summary'] = {
  assignedPatients: 14,
  photosToReview: { count: 7, oldestUploadAt: hoursAgo(96) },
  unreadMessages: { count: 3, patients: 2 },
  checkInsSubmitted: { count: 5, since: hoursAgo(168), days: 7 },
  adherenceUnderThreshold: { count: 2, threshold: 60, windowDays: 14 },
};
const row = (over: Partial<WorklistRow> = {}): WorklistRow => ({
  patientId: 'patient a', name: 'Synthetic Ada', joinedAt: hoursAgo(5000),
  photos: { unreviewedCount: 0, oldestUploadAt: null }, unreadMessages: 0, latestCheckInAt: null,
  urgent: { open: 0, acknowledged: 0, oldestAt: null }, adherence: null, ...over,
});
const response = (filter: WorklistFilter, page = 1, data: WorklistRow[] = []): WorklistResponse => ({
  filter, localDate: '2026-09-16', summary, data, pagination: { page, limit: 20, total: data.length, totalPages: 1 },
});
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((ok) => { resolve = ok; }); return { promise, resolve }; };

test('loads with the filter, page, search and clinician local date; filter and search reset to page one', async () => {
  const calls: WorklistQuery[] = [];
  const controller = new WorklistController(async (query) => { calls.push(query); return response(query.filter, query.page); }, () => NOW);
  await controller.restore('all', 3, 'Ada');
  await controller.goToPage(4);
  await controller.setFilter('flagged');
  await controller.search('Ben');
  const localDate = '2026-09-16';
  assert.deepEqual(calls, [
    { filter: 'all', page: 3, search: 'Ada', localDate },
    { filter: 'all', page: 4, search: 'Ada', localDate },
    { filter: 'flagged', page: 1, search: 'Ada', localDate },
    { filter: 'flagged', page: 1, search: 'Ben', localDate },
  ]);
  assert.equal(controller.snapshot().status, 'ready');
  assert.equal(controller.snapshot().checkedAt, NOW);
});

test('an API without the worklist endpoint switches to the legacy lists and stops loading', async () => {
  let calls = 0;
  const controller = new WorklistController(async () => { calls += 1; throw new APIError(404, 'Route not found'); }, () => NOW);
  await controller.load();
  assert.equal(controller.snapshot().status, 'unsupported');
  await controller.retry();
  await controller.setFilter('all');
  assert.equal(calls, 1);
  assert.equal(controller.snapshot().status, 'unsupported');
});

test('other failures keep the last result on screen and retry repeats the same load', async () => {
  const calls: WorklistQuery[] = [];
  let fail = false;
  const controller = new WorklistController(async (query) => {
    calls.push(query);
    if (fail) throw new APIError(500, 'Worklist failed');
    return response(query.filter, query.page, [row()]);
  }, () => NOW);
  await controller.restore('needs-review', 2, '');
  fail = true;
  await controller.retry();
  assert.equal(controller.snapshot().status, 'error');
  assert.equal(controller.snapshot().result?.data.length, 1);
  fail = false;
  await controller.retry();
  assert.equal(controller.snapshot().status, 'ready');
  assert.deepEqual(calls.map((query) => [query.filter, query.page]), [['needs-review', 2], ['needs-review', 2], ['needs-review', 2]]);
});

test('an older response finishing last never replaces the newer filter', async () => {
  const slow = deferred<WorklistResponse>(), fast = deferred<WorklistResponse>();
  const controller = new WorklistController((query) => (query.filter === 'all' ? slow.promise : fast.promise), () => NOW);
  const first = controller.setFilter('all');
  const second = controller.setFilter('flagged');
  fast.resolve(response('flagged'));
  await second;
  slow.resolve(response('all'));
  await first;
  assert.equal(controller.snapshot().filter, 'flagged');
  assert.equal(controller.snapshot().result?.filter, 'flagged');
});

test('clinician dates and waiting times are mono stamps', () => {
  assert.equal(stamp(new Date(2026, 8, 2, 7, 4).toISOString()), '02 SEP · 07:04');
  assert.equal(longDate(NOW), 'Wednesday 16 September · 08:40');
  assert.equal(localDateOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(waited(hoursAgo(0.3), NOW), '<1H');
  assert.equal(waited(hoursAgo(6), NOW), '6H');
  assert.equal(waited(hoursAgo(96), NOW), '4D');
});

test('the four counts use real figures and plain notes', () => {
  assert.deepEqual(summaryTiles(summary, NOW), [
    { label: 'Photos to review', value: 7, note: 'Oldest waiting 4 days', unread: false },
    { label: 'Unread messages', value: 3, note: '2 patients', unread: true },
    { label: 'Check-ins submitted', value: 5, note: 'Last 7 days', unread: false },
    { label: 'Adherence under 60%', value: 2, note: '14-day window', unread: false },
  ]);
  const quiet = { ...summary, photosToReview: { count: 0, oldestUploadAt: null }, unreadMessages: { count: 0, patients: 0 } };
  assert.deepEqual(summaryTiles(quiet, NOW).slice(0, 2).map((tile) => [tile.note, tile.unread]), [['None waiting', false], ['None unread', false]]);
  assert.deepEqual(summaryTiles(null, NOW).map((tile) => [tile.label, tile.value]), [['Photos to review', null], ['Unread messages', null], ['Check-ins submitted', null], ['Adherence under 60%', null]]);
});

test('row actions keep the list context; flagged rows open the urgent report', () => {
  assert.deepEqual(rowAction('needs-review', row(), 'page=2'), { label: 'Review photos', href: '/patients/patient%20a?page=2', ariaLabel: 'Review photos for Synthetic Ada' });
  assert.deepEqual(rowAction('flagged', row(), 'page=1&filter=flagged'), { label: 'Open report', href: '/patients/patient%20a?page=1&filter=flagged#urgent', ariaLabel: 'Open urgent report for Synthetic Ada' });
  assert.deepEqual(rowAction('all', row({ name: null }), 'page=1&filter=all'), { label: 'Open patient', href: '/patients/patient%20a?page=1&filter=all', ariaLabel: 'Open patient' });
});

test('activity is said in words, never message content', () => {
  assert.deepEqual(activity(row()), ['No new activity']);
  assert.deepEqual(
    activity(row({ urgent: { open: 1, acknowledged: 1, oldestAt: hoursAgo(5) }, unreadMessages: 1, latestCheckInAt: new Date(2026, 8, 15, 7, 4).toISOString() })),
    ['Urgent reports · 1 open · 1 seen', '1 unread message', 'Check-in · 15 SEP · 07:04'],
  );
});

test('adherence reads from recorded days only, with no grading', () => {
  assert.equal(adherenceText(null), 'No active routine');
  assert.equal(adherenceText({ percent: null, completedDays: 0, countedDays: 0, days: [] }), 'No days recorded yet');
  assert.equal(adherenceText({ percent: 79, completedDays: 11, countedDays: 14, days: Array.from({ length: 14 }, (_, i) => ({ localDate: `d${i}`, routines: 2 as const })) }), '79% / 14d');
  assert.equal(dayBar(2), 'block h-full w-1.5 bg-ink');
  assert.equal(dayBar(1), 'block h-[70%] w-1.5 bg-ink');
  assert.equal(dayBar(0), 'block h-[40%] w-1.5 border border-ink/30 bg-sunk');
  assert.equal(dayBar(null), 'block h-px w-1.5 bg-rule');
});

test('empty states name what is empty and offer at most one next step', () => {
  assert.deepEqual(emptyCopy('needs-review', ''), { title: 'No photos waiting', body: 'Shared photos appear here until you mark them reviewed.', action: 'show-all' });
  assert.deepEqual(emptyCopy('flagged', ''), { title: 'No urgent reports', body: 'Nothing your patients have reported is waiting.', action: null });
  assert.deepEqual(emptyCopy('all', ''), { title: 'No assigned patients yet', body: 'Patients assigned to you will appear here.', action: null });
  assert.deepEqual(emptyCopy('flagged', 'Zed'), { title: 'No patients match this name', body: 'Check the spelling or clear the search.', action: 'clear-search' });
});
