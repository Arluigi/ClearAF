import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inboxUnread, linkedLabel, referenceLabel, threadTime, turnEyebrow, type Conversation, type MessageRecord } from '../src/lib/assigned-messaging';
import { MessageTurn } from '../src/components/messages/MessageTurn';
import { ThreadList } from '../src/components/messages/ThreadList';
import { PhotoReferenceList } from '../src/components/messages/PhotoReferenceList';
import { read } from './letterpress-rules';

const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  id: 'm', patientId: 'p1', clinicianId: 'c', senderId: 'c', senderType: 'dermatologist', recipientId: 'p1', recipientType: 'patient',
  content: 'Keep the adapalene to three nights a week.', sentAt: '2026-09-14T16:12:00', unreadForMe: false, reference: null, origin: 'native', ...over,
});
const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  patientId: 'p1', clinicianId: 'c', patientName: 'Synthetic Ada', clinicianName: 'Synthetic Clinician',
  lastMessage: message({ sentAt: '2026-09-14T08:03:00', content: 'Bring the tube to your appointment.' }), unreadCount: 0, ...over,
});
const noop = () => {};

test('turn eyebrows are mono stamps with You or the patient first name; thread times are a clock today and a day otherwise', () => {
  assert.equal(turnEyebrow(message(), 'Ada'), '14 SEP · 16:12 · You');
  assert.equal(turnEyebrow(message({ senderType: 'patient' }), 'Ada'), '14 SEP · 16:12 · Ada');
  assert.equal(turnEyebrow(message({ senderType: 'patient' }), ''), '14 SEP · 16:12 · Patient');
  const now = new Date(2026, 8, 14, 18, 0);
  assert.equal(threadTime('2026-09-14T08:03:00', now), '08:03');
  assert.equal(threadTime('2026-09-12T08:03:00', now), '12 SEP');
  assert.equal(inboxUnread([conversation({ unreadCount: 3 }), conversation({ unreadCount: 2 })]), 5);
  assert.equal(referenceLabel({ type: 'photo', id: 'x', available: true, label: 'Photo · 12 Sep', occurredAt: null }), 'Photo · 12 Sep');
  assert.equal(referenceLabel({ type: 'photo', id: 'x', available: false, label: null, occurredAt: null }), 'Photo unavailable');
  assert.equal(referenceLabel({ type: 'routineRevision', id: 'x', available: true, label: null, occurredAt: null }), 'Routine revision');
  assert.equal(linkedLabel({ type: 'photo', id: 'x' }, '2026-09-12T07:00:00'), 'Links photo 12 SEP');
  assert.equal(linkedLabel({ type: 'photo', id: 'x' }, null), 'Links the selected photo');
  assert.equal(linkedLabel({ type: 'routineRevision', id: 'x' }, null), 'Links the selected routine version');
});

test('clinician turns are serif behind a 2px ink rule; patient replies sit in sunk blocks; unread says so', () => {
  const clinician = renderToStaticMarkup(h(MessageTurn, { message: message({ reference: { type: 'photo', id: 'x', available: true, label: 'Photo · 12 Sep', occurredAt: null } }), patientFirstName: 'Ada', onReference: noop }));
  assert.match(clinician, /border-l-2 border-ink/); assert.match(clinician, /font-display/); assert.doesNotMatch(clinician, /bg-sunk/);
  assert.match(clinician, /14 SEP · 16:12 · You/);
  assert.match(clinician, /Photo · 12 Sep/); assert.match(clinician, /Attached reference/);
  const unread = renderToStaticMarkup(h(MessageTurn, { message: message({ senderType: 'patient', unreadForMe: true }), patientFirstName: 'Ada', onReference: noop }));
  assert.match(unread, /bg-sunk/); assert.doesNotMatch(unread, /font-display/);
  assert.match(unread, /14 SEP · 16:12 · Ada · Unread/);
  assert.match(unread, /text-attention-text/); assert.match(unread, /rgb\(var\(--attention-mark\)\)/);
  assert.doesNotMatch(renderToStaticMarkup(h(MessageTurn, { message: message({ senderType: 'patient' }), patientFirstName: 'Ada', onReference: noop })), /attention/);
});

test('thread list: the open thread carries the ink rule; unread threads say how many in words', () => {
  const html = renderToStaticMarkup(h(ThreadList, {
    conversations: [conversation(), conversation({ patientId: 'p2', patientName: 'Synthetic Ben', unreadCount: 2, lastMessage: null })],
    selectedId: 'p1', now: new Date(2026, 8, 14, 18, 0),
  }));
  assert.match(html, /aria-current="true" class="[^"]*selected-rule/);
  assert.match(html, />08:03</); assert.match(html, /Bring the tube to your appointment\./);
  assert.match(html, />2 unread</); assert.match(html, /No messages yet/);
});

test('photo reference picker lists shared photos by date on the photo mat', () => {
  const photo = { id: 'x', userId: 'p', skinScore: 0, captureDate: '2026-09-12T07:00:00', createdAt: '2026-09-12T07:00:00', updatedAt: '2026-09-12T07:00:00' };
  const html = renderToStaticMarkup(h(PhotoReferenceList, { photos: [photo], previews: {}, onChoose: noop }));
  assert.match(html, /aria-label="Attach photo from 12 SEP · 07:00"/); assert.match(html, /photo-mat/); assert.match(html, />12 SEP</);
  assert.match(renderToStaticMarkup(h(PhotoReferenceList, { photos: [], previews: {}, onChoose: noop })), /No shared photos to attach\./);
});

test('messages page: thread list plus thread; the composer has one filled Send, Attach photo reference and a mono counter', () => {
  const page = read('src/app/messages/page.tsx');
  assert.match(page, /<ThreadList /); assert.match(page, /messageReference\(referenceType, referenceId\)/);
  assert.match(page, /recordHref=\{"\/patients\/" \+ encodeURIComponent\(patientId\)\}/);
  const view = read('src/components/messages/ConversationView.tsx');
  assert.match(view, />Attach photo reference</);
  assert.match(view, /\{state\.text\.length\} \/ 4000/);
  assert.match(view, /controller\.link\(\{ type: "photo", id: photo\.id \}\)/);
  assert.doesNotMatch(view, /ml-auto bg-surface|mr-auto bg-sunk/);
  assert.equal((view.match(/<Button\s+type="submit"/g) ?? []).length, 1);
});
