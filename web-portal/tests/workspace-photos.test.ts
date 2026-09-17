import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparePanes, defaultPair, replyTarget, reviewWords } from '../src/lib/workspace';
import { PhotoCompareView } from '../src/components/patients/workspace/PhotoCompareView';
import { PhotoStrip } from '../src/components/patients/workspace/PhotoStrip';
import { PhotoReplyView } from '../src/components/patients/workspace/PhotoReplyView';
import { CareRailView } from '../src/components/patients/workspace/CareRailView';
import type { PhotoSummary } from '../src/types/api';
import type { FeedbackState } from '../src/lib/photo-feedback';
import type { RoutineCareState } from '../src/lib/routine-care';
import type { CheckInResponse } from '../src/lib/care-support';
import { read } from './letterpress-rules';

const photo = (id: string, captureDate: string, notes?: string): PhotoSummary => ({ id, userId: 'p', skinScore: 0, captureDate, createdAt: captureDate, updatedAt: captureDate, notes });
const photos = [photo('late', '2026-09-15T07:12:00'), photo('early', '2026-09-02T07:04:00'), photo('middle', '2026-09-09T07:00:00', 'Chin is drier than last week.')];
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;
const noop = () => {};
const reviewed = { photoId: 'late', reviewerName: 'Synthetic Clinician', reviewedAt: '2026-09-16T08:00:00' };

test('compare defaults to the newest photo and the one before it, older on the left; the reply targets the newer', () => {
  assert.deepEqual(defaultPair(photos), ['middle', 'late']);
  assert.deepEqual(defaultPair([photos[1]]), ['early']);
  assert.deepEqual(comparePanes(photos, ['late', 'early']).map(p => p.id), ['early', 'late']);
  assert.equal(replyTarget(photos, ['late', 'early'])?.id, 'late');
  assert.equal(replyTarget(photos, []), null);
  assert.equal(reviewWords(undefined), 'Not reviewed');
  assert.equal(reviewWords(reviewed), 'Reviewed · Synthetic Clinician · 16 SEP');
});

test('compare view: uncropped originals on the photo mat with mono stamps, review words and no filled button', () => {
  const html = renderToStaticMarkup(h(PhotoCompareView, { panes: [
    { photo: photos[1], original: { url: 'https://synthetic.invalid/early' } },
    { photo: photos[0], original: {}, review: reviewed },
  ], zoom: 150, onZoom: noop, onRetry: noop }));
  assert.equal((html.match(/photo-mat/g) ?? []).length, 2);
  assert.match(html, /object-contain/);
  assert.match(html, /referrerpolicy="no-referrer"|referrerPolicy="no-referrer"/);
  assert.match(html, /02 SEP · 07:04/); assert.match(html, /15 SEP · 07:12/);
  assert.match(html, /Reviewed · Synthetic Clinician · 16 SEP/); assert.match(html, /Not reviewed/);
  assert.match(html, />Loading original</); assert.match(html, /150%/);
  assert.match(html, /Lighting and capture conditions may differ between photos\./);
  assert.equal(filled(html), 0);
  assert.match(renderToStaticMarkup(h(PhotoCompareView, { panes: [], zoom: 100, onZoom: noop, onRetry: noop })), /Choose photos to compare/);
});

test('photo strip: selected tiles use the inset ink outline, a third choice is disabled with a reason, states in words', () => {
  const html = renderToStaticMarkup(h(PhotoStrip, {
    photos, previews: { late: { status: 'error' } }, selected: ['middle', 'late'],
    reviews: { early: { photoId: 'early', reviewerName: 'C', reviewedAt: '2026-09-03T00:00:00' } }, reviewStatus: 'ready',
    total: 18, page: 1, totalPages: 2, onToggle: noop, onPage: noop,
  }));
  assert.match(html, /All photos · 18/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.match(html, /aria-pressed:selected-outline/);
  assert.match(html, /aria-pressed="false"[^>]*disabled=""/);
  assert.match(html, /Two photos selected\. Deselect one to compare another\./);
  assert.match(html, /2 selected · 2 not reviewed on this page/);
  assert.match(html, /Preview unavailable/);
  assert.match(html, /Page 1 of 2/);
  assert.equal(filled(html), 0);
});

const feedback = (over: Partial<FeedbackState> = {}): FeedbackState => ({ text: 'Keep going', photoId: 'late', status: 'draft', reviewed: false, ...over });
const reply = (over: Partial<FeedbackState> = {}, isReviewed = false, target: PhotoSummary | null = photos[0]) => renderToStaticMarkup(h(PhotoReplyView, {
  patientFirstName: 'Ada', target, feedback: feedback(over),
  frozen: ['sending', 'marking', 'send-failed', 'mark-failed'].includes(over.status ?? 'draft'),
  reviewed: isReviewed, reviewPending: false, reviewError: false,
  onEdit: noop, onSubmit: noop, onNewDraft: noop, onLeaveUnreviewed: noop, onMarkOnly: noop, onCareDecision: noop,
}));

test('reply: one filled action that sends and marks reviewed, with honest partial-failure copy', () => {
  let html = reply();
  assert.equal(filled(html), 1);
  assert.match(html, />Send &amp; mark reviewed</);
  assert.match(html, /Links photo 15 SEP/);
  assert.match(html, />Mark reviewed without reply</);
  assert.match(html, /placeholder="Write to Ada…"/);
  assert.match(reply({ status: 'sending' }), />Sending…</);
  assert.match(reply({ status: 'marking', text: '' }), />Marking reviewed…</);
  html = reply({ status: 'send-failed' });
  assert.match(html, /Message could not be confirmed\. The photo is not marked reviewed\. Retry sends the same message\./);
  assert.match(html, />Retry same message</); assert.match(html, />Edit as a new message</);
  html = reply({ status: 'mark-failed', text: '' });
  assert.match(html, /Message sent\. The photo is not marked reviewed yet\./);
  assert.match(html, />Retry marking reviewed</); assert.match(html, />Leave photo unreviewed</);
  assert.equal(filled(html), 1);
  assert.match(reply({ status: 'sent', text: '', reviewed: true }), /Sent\. Photo marked reviewed\./);
  html = reply({}, true);
  assert.match(html, />Send reply</); assert.doesNotMatch(html, /Mark reviewed without reply/);
  assert.match(reply({ text: '' }), /Write a reply to send it with this photo linked\./);
  assert.match(reply({}, false, photos[2]), /Patient note on 09 SEP[\s\S]*Chin is drier than last week\./);
  assert.match(reply({ text: '' }, false, null), /Select a photo to reply about it\./);
});

const routineState = (): RoutineCareState => ({
  loadStatus: 'ready', loadError: '',
  history: { entries: [], page: 1, total: 0, totalPages: 1, status: 'ready', error: '' },
  slots: {
    morning: { routine: { id: 'r', userId: 'p', timeOfDay: 'morning', version: 4, createdBy: 'c', createdAt: '2026-09-02T00:00:00', name: 'Morning', isActive: true, steps: [{ title: 'Gentle cleanser', instructions: '' }, { title: 'Adapalene 0.1%', instructions: '' }] }, draft: { name: 'Morning', isActive: true, steps: [] }, expectedRevisionId: 'r', status: 'ready', error: '', dirty: false, hasPendingSave: false },
    evening: { routine: null, draft: { name: '', isActive: true, steps: [] }, expectedRevisionId: null, status: 'ready', error: '', dirty: false, hasPendingSave: false },
  },
});
const checkIn: CheckInResponse = {
  id: 'x', userId: 'p', formId: 'f', submittedAt: '2026-09-14T20:11:00', receivedAt: '2026-09-14T20:11:00', answers: [{ questionId: 'q1', optionId: 'o2' }],
  form: { id: 'f', userId: 'p', version: 2, createdBy: 'c', createdAt: '2026-09-01T00:00:00', title: 'Weekly check-in', isActive: true, questions: [
    { id: 'q1', prompt: 'Dryness this week', type: 'choice', required: true, options: [{ id: 'o1', label: 'Worse than last week' }, { id: 'o2', label: 'Better than last week' }] },
    { id: 'q2', prompt: 'Missed doses', type: 'text', required: false, options: [] },
  ] },
};

test('care rail keeps the current routine and the latest check-in in view', () => {
  const html = renderToStaticMarkup(h(CareRailView, { routine: routineState(), latest: checkIn, checkInStatus: 'ready', onRetry: noop, onOpen: noop }));
  assert.match(html, /Morning routine/); assert.match(html, />V4</); assert.match(html, /Gentle cleanser/);
  assert.match(html, /Evening routine[\s\S]*Not assigned\./);
  assert.match(html, /Latest check-in · 14 SEP/); assert.match(html, /Better than last week/);
  assert.match(html, /Missed doses[\s\S]*Not answered/);
  assert.equal(filled(html), 0);
  assert.match(renderToStaticMarkup(h(CareRailView, { routine: routineState(), latest: null, checkInStatus: 'ready', onRetry: noop, onOpen: noop })), /No check-ins submitted yet\./);
});

test('the photos tab has no viewing dialogs; compare is the default and replies go through the feedback controller', () => {
  const source = read('src/components/patients/PatientPhotoHistory.tsx');
  assert.doesNotMatch(source, /<Dialog|restorePhotoFocus|Compare photos/);
  assert.match(source, /reviews\.load\(ids, previous\.length \? previous : defaultPair\(state\.photos\)\)/);
  assert.match(source, /new PhotoFeedbackController\(/);
  assert.match(source, /api\.sendAssignedMessage\(patientId, clinicianId, id, body\)/);
  assert.match(source, /await reviews\.mark\(photoId\)/);
  assert.match(read('src/app/patients/[id]/page.tsx'), /rail=\{<CareRail /);
});
