import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appendQuickReply, quickReplies, type QuickReplyContext } from '../src/lib/quick-replies';
import { QuickReplyChips } from '../src/components/messages/QuickReplyChips';
import { read } from './letterpress-rules';

const both: QuickReplyContext = { activeVersion: 4, checkInDay: '14 Sep' };
const neither: QuickReplyContext = { activeVersion: null, checkInDay: null };
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;

test('quickReplies: the five approved strings, substituted exactly, in order', () => {
  const replies = quickReplies(both);
  assert.deepEqual(replies.map(reply => reply.text), [
    'Reviewed — no change to your routine. Keep it up!',
    "Reviewed. Stay with v4 as written — you're doing the right things.",
    'Photos are coming through clearly. Keep them coming!',
    'Recorded. Next check-in is 14 Sep — see you then.',
    'Reviewed. Could I get a closer photo in better light next time?',
  ]);
});

test('quickReplies: a chip whose token is unavailable is omitted, never a placeholder, a blank or a guess', () => {
  const noVersion = quickReplies({ activeVersion: null, checkInDay: '14 Sep' });
  assert.equal(noVersion.some(reply => reply.id === 'stay-version'), false);
  assert.ok(noVersion.every(reply => !reply.text.includes('undefined') && !reply.text.includes('null')));
  const noDay = quickReplies({ activeVersion: 4, checkInDay: null });
  assert.equal(noDay.some(reply => reply.id === 'next-check-in'), false);
  // Neither token available: only the three chips that need no substitution remain.
  const neitherAvailable = quickReplies(neither);
  assert.deepEqual(neitherAvailable.map(reply => reply.id), ['no-change', 'photos-clear', 'closer-photo']);
});

test('appendQuickReply: fills an empty draft, appends existing text on a new line rather than overwriting it', () => {
  assert.equal(appendQuickReply('', 'Reviewed.'), 'Reviewed.');
  assert.equal(appendQuickReply('   ', 'Reviewed.'), 'Reviewed.');
  assert.equal(appendQuickReply('Thanks for sending this.', 'Reviewed.'), 'Thanks for sending this.\nReviewed.');
});

test('chips: outlined 32px controls, never a second filled button, disabled together with the field they fill', () => {
  const html = renderToStaticMarkup(h(QuickReplyChips, { context: both, text: '', disabled: false, onFill: () => {} }));
  assert.match(html, /Reviewed — no change to your routine\. Keep it up!/);
  assert.match(html, /Reviewed\. Stay with v4 as written/);
  assert.match(html, /Recorded\. Next check-in is 14 Sep — see you then\./);
  assert.equal((html.match(/<button[^>]*type="button"/g) ?? []).length, 5);
  assert.equal((html.match(/\bmin-h-8\b/g) ?? []).length, 5);
  assert.equal(filled(html), 0);
  const disabled = renderToStaticMarkup(h(QuickReplyChips, { context: both, text: '', disabled: true, onFill: () => {} }));
  assert.equal((disabled.match(/disabled=""/g) ?? []).length, 5);
});

test('chips: a chip whose token is unavailable is not rendered at all', () => {
  const html = renderToStaticMarkup(h(QuickReplyChips, { context: neither, text: '', disabled: false, onFill: () => {} }));
  assert.doesNotMatch(html, /Stay with v/);
  assert.doesNotMatch(html, /Next check-in is/);
  assert.equal((html.match(/<button[^>]*type="button"/g) ?? []).length, 3);
});

test('chips fill the draft, not send it: onClick appends via appendQuickReply, buttons are type="button" so they never submit the composer form', () => {
  const source = read('src/components/messages/QuickReplyChips.tsx');
  assert.match(source, /type="button"/);
  assert.match(source, /onClick=\{\(\) => onFill\(appendQuickReply\(text, reply\.text\)\)\}/);
  assert.doesNotMatch(source, /type="submit"/);
});

test('the photo reply box wires quick replies to fill (onEdit), not to send or mark reviewed', () => {
  const source = read('src/components/patients/workspace/PhotoReplyView.tsx');
  assert.match(source, /<QuickReplyChips context=\{quickReplyContext\} text=\{text\} disabled=\{frozen \|\| !target\} onFill=\{onEdit\} \/>/);
  assert.match(source, /<Textarea id="photo-reply"/);
  // Quick replies sit above the reply textarea.
  assert.ok(source.indexOf('<QuickReplyChips') < source.indexOf('<Textarea id="photo-reply"'));
});

test('the message composer wires quick replies to fill the draft (controller.edit), not to send', () => {
  const source = read('src/components/messages/ConversationView.tsx');
  assert.match(source, /<QuickReplyChips context=\{\{ activeVersion, checkInDay: null \}\} text=\{state\.text\} disabled=\{controller\.frozen\} onFill=\{value => controller\.edit\(value\)\} \/>/);
  assert.ok(source.indexOf('<QuickReplyChips') < source.indexOf('<Textarea\n          id={composer}'));
  // Exactly one submit control remains: the existing Send button.
  assert.equal((source.match(/<Button\s+type="submit"/g) ?? []).length, 1);
});

test('the patient workspace and the standalone Messages page source version and check-in day from data already on the page', () => {
  const patientPhotoHistory = read('src/components/patients/PatientPhotoHistory.tsx');
  assert.match(patientPhotoHistory, /activeRoutineVersion\(routine\)/);
  assert.match(patientPhotoHistory, /writtenDay\(latestCheckIn\.submittedAt\)/);
  const workspacePage = read('src/app/patients/[id]/page.tsx');
  assert.match(workspacePage, /routine=\{routine\.state\}/);
  assert.match(workspacePage, /activeVersion=\{activeRoutineVersion\(routine\.state\)\}/);
  // The standalone Messages page has no routine controller mounted, so it never fabricates a version there.
  const messagesPage = read('src/app/messages/page.tsx');
  assert.doesNotMatch(messagesPage, /activeVersion=/);
});
