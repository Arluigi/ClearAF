import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoFeedbackController } from '../src/lib/photo-feedback';
import type { MessageBody, MessageRecord } from '../src/lib/assigned-messaging';

const record = (id: string, body: MessageBody): MessageRecord => ({
  id, patientId: 'p', clinicianId: 'c', senderId: 'c', senderType: 'dermatologist', recipientId: 'p', recipientType: 'patient',
  content: body.content, sentAt: '2026-09-16T08:00:00.000Z', unreadForMe: false,
  reference: body.reference ? { ...body.reference, available: true, label: 'Photo', occurredAt: null } : null, origin: 'native',
});
const ids = () => { let n = 0; return () => `message-${++n}`; };

test('send and mark reviewed are two calls in order; the reply links the photo and clears when both succeed', async () => {
  const calls: string[] = [];
  const controller = new PhotoFeedbackController(
    async (id, body) => { calls.push(`send:${id}:${body.reference?.type}:${body.reference?.id}:${body.content}`); return record(id, body); },
    async photoId => { calls.push(`mark:${photoId}`); },
    ids(),
  );
  controller.target('photo-1');
  controller.edit('  Keep the adapalene to three nights.  ');
  await controller.submit(false);
  assert.deepEqual(calls, ['send:message-1:photo:photo-1:Keep the adapalene to three nights.', 'mark:photo-1']);
  const state = controller.snapshot();
  assert.deepEqual([state.status, state.text, state.reviewed, controller.frozen], ['sent', '', true, false]);
});

test('a lost send keeps the frozen message, retries the same id and body, and never marks first', async () => {
  const sends: string[] = []; let fail = true; let marks = 0;
  const controller = new PhotoFeedbackController(
    async (id, body) => { sends.push(`${id}:${body.content}`); if (fail) throw new Error('offline'); return record(id, body); },
    async () => { marks++; },
    ids(),
  );
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  assert.deepEqual([controller.snapshot().status, marks, controller.frozen], ['send-failed', 0, true]);
  controller.edit('Changed'); controller.target('photo-2');
  assert.deepEqual([controller.snapshot().text, controller.snapshot().photoId], ['Reply', 'photo-1']);
  fail = false; await controller.submit(false);
  assert.deepEqual(sends, ['message-1:Reply', 'message-1:Reply']);
  assert.deepEqual([marks, controller.snapshot().status], [1, 'sent']);
});

test('a failed review after a confirmed send retries only the review', async () => {
  let sends = 0; let fail = true; const marks: string[] = [];
  const controller = new PhotoFeedbackController(
    async (id, body) => { sends++; return record(id, body); },
    async photoId => { marks.push(photoId); if (fail) throw new Error('offline'); },
    ids(),
  );
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  assert.deepEqual([controller.snapshot().status, controller.snapshot().text, controller.frozen], ['mark-failed', '', true]);
  fail = false; await controller.submit(false);
  assert.deepEqual([sends, marks, controller.snapshot().status], [1, ['photo-1', 'photo-1'], 'sent']);
});

test('leaving a photo unreviewed after a failed review releases the reply without resending', async () => {
  let sends = 0;
  const controller = new PhotoFeedbackController(async (id, body) => { sends++; return record(id, body); }, async () => { throw new Error('offline'); }, ids());
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  controller.leaveUnreviewed();
  assert.deepEqual([controller.snapshot().status, controller.frozen, sends], ['draft', false, 1]);
});

test('an already reviewed photo sends without a review call; empty replies and missing photos do nothing', async () => {
  let sends = 0; let marks = 0;
  const controller = new PhotoFeedbackController(async (id, body) => { sends++; return record(id, body); }, async () => { marks++; }, ids());
  controller.edit('No photo yet'); await controller.submit(false);
  controller.target('photo-1'); controller.edit('   '); await controller.submit(false);
  assert.equal(sends, 0);
  controller.edit('Reply'); await controller.submit(true);
  assert.deepEqual([sends, marks, controller.snapshot().status, controller.snapshot().reviewed], [1, 0, 'sent', false]);
});

test('a send result for another message is not accepted', async () => {
  const controller = new PhotoFeedbackController(async (_id, body) => record('other', body), async () => {}, ids());
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  assert.equal(controller.snapshot().status, 'send-failed');
});

test('editing as a new message after a failed send issues a fresh id', async () => {
  const sent: string[] = []; let fail = true;
  const controller = new PhotoFeedbackController(async (id, body) => { sent.push(id); if (fail) throw new Error('offline'); return record(id, body); }, async () => {}, ids());
  controller.target('photo-1'); controller.edit('Reply'); await controller.submit(false);
  controller.newDraft(); controller.edit('Reply, edited'); fail = false; await controller.submit(false);
  assert.deepEqual(sent, ['message-1', 'message-2']);
});

test('target() dropped during a frozen send is not lost: calling it again once the attempt clears re-links the reply', async () => {
  const controller = new PhotoFeedbackController(async (id, body) => record(id, body), async () => {}, ids());
  controller.target('photo-1'); controller.edit('Reply');
  const pending = controller.submit(false); // now frozen (sending)
  controller.target('photo-2'); // PatientPhotoHistory's effect fires again (selection changed) but is a no-op
  assert.deepEqual([controller.snapshot().photoId, controller.frozen], ['photo-1', true]);
  await pending; // attempt clears (sent)
  assert.equal(controller.frozen, false);
  // Simulates the effect re-running because reply.status changed: the reply now re-links to the current target.
  controller.target('photo-2');
  assert.equal(controller.snapshot().photoId, 'photo-2');
});

test('cancel discards a late result', async () => {
  let finish!: () => void; let marks = 0;
  const controller = new PhotoFeedbackController(
    (id, body) => new Promise<MessageRecord>(resolve => { finish = () => resolve(record(id, body)); }),
    async () => { marks++; },
    ids(),
  );
  controller.target('photo-1'); controller.edit('Reply');
  const pending = controller.submit(false);
  controller.cancel(); finish(); await pending;
  assert.deepEqual([controller.snapshot().status, marks, controller.frozen], ['draft', 0, false]);
});
