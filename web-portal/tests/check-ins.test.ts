import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { answerSeries, answerText, choiceQuestions, formSummary, type CheckInResponse, type Form } from '../src/lib/care-support';
import { AnswerPlot, AssignedFormSummary, CheckInResponseView, SubmissionTable } from '../src/components/care-support/CheckInViews';
import { read } from './letterpress-rules';

const form = (version: number, options = ['Worse than last week', 'About the same', 'Better than last week']): Form => ({
  id: `form-${version}`, userId: 'p', version, createdBy: 'c', createdAt: '2026-08-01T00:00:00', title: 'Weekly check-in', isActive: true,
  questions: [
    { id: 'dryness', prompt: 'How is the dryness this week?', type: 'choice', required: true, options: options.map((label, i) => ({ id: `v${version}-o${i}`, label })) },
    { id: 'notes', prompt: 'Anything to add?', type: 'text', required: false, options: [] },
  ],
});
const response = (id: string, submittedAt: string, f: Form, optionIndex: number | null, text?: string): CheckInResponse => ({
  id, userId: 'p', formId: f.id, submittedAt, receivedAt: submittedAt, form: f,
  answers: [
    ...(optionIndex === null ? [] : [{ questionId: 'dryness', optionId: f.questions[0].options[optionIndex].id }]),
    ...(text ? [{ questionId: 'notes', text }] : []),
  ],
});
const rows = [
  response('r4', '2026-09-14T20:11:00', form(2), 2, 'Chin still flaky in the mornings.'),
  response('r3', '2026-09-07T20:00:00', form(2), 1),
  response('r2', '2026-08-31T20:00:00', form(1, ['Worse', 'Better']), 0),
  response('r1', '2026-08-24T20:00:00', form(1, ['Worse', 'Better']), null),
];
const filled = (html: string) => (html.match(/class="[^"]*\bbg-ink text-canvas\b[^"]*"/g) ?? []).length;
const noop = () => {};

test('answers read as given; ordered-choice answers are plotted oldest first against their own version options', () => {
  assert.equal(answerText(rows[0].form.questions[0], rows[0]), 'Better than last week');
  assert.equal(answerText(rows[0].form.questions[1], rows[0]), 'Chin still flaky in the mornings.');
  assert.equal(answerText(rows[1].form.questions[1], rows[1]), 'Not answered');
  assert.deepEqual(answerSeries(rows, 'dryness').map(p => [p.responseId, p.index, p.label, p.options.length, p.formVersion]), [
    ['r1', null, 'Not answered', 2, 1], ['r2', 0, 'Worse', 2, 1], ['r3', 1, 'About the same', 3, 2], ['r4', 2, 'Better than last week', 3, 2],
  ]);
  assert.deepEqual(answerSeries(rows, 'notes'), []);
  assert.deepEqual(choiceQuestions(form(2)).map(q => q.id), ['dryness']);
  assert.equal(formSummary(form(2)), '2 questions · 1 required');
});

test('response view: question by question with required flags, form version in mono and one filled Reply action', () => {
  const html = renderToStaticMarkup(h(CheckInResponseView, { response: rows[1], patientFirstName: 'Ada', onReply: noop }));
  assert.match(html, /Form v2 · submitted 07 SEP · 20:00/);
  assert.match(html, /How is the dryness this week\?[\s\S]*\(required\)/);
  assert.match(html, /About the same/);
  assert.match(html, /Anything to add\?[\s\S]*Not answered/);
  assert.match(html, />Reply to Ada</);
  assert.equal(filled(html), 1);
  assert.match(renderToStaticMarkup(h(CheckInResponseView, { response: rows[0], patientFirstName: 'Ada', onReply: noop })), /“Chin still flaky in the mornings\.”/);
});

test('submissions on the page are a ruled table with the shown response selected', () => {
  const html = renderToStaticMarkup(h(SubmissionTable, { responses: rows, openId: 'r3', onOpen: noop }));
  assert.match(html, /data-state="selected"[\s\S]*07 SEP · 20:00/);
  assert.match(html, /Weekly check-in · v1/);
  assert.match(html, />Showing</);
  assert.equal((html.match(/>Open</g) ?? []).length, 3);
});

test('answer plot marks each answer as given with the same answers in words, and never a score', () => {
  const html = renderToStaticMarkup(h(AnswerPlot, { question: rows[0].form.questions[0], questions: [rows[0].form.questions[0]], series: answerSeries(rows, 'dryness'), onQuestion: noop }));
  assert.equal((html.match(/rounded-full bg-ink/g) ?? []).length, 3);
  for (const text of ['24 AUG', 'Not answered', 'Worse', 'About the same', 'Better than last week', 'Not a computed score']) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /average|mean|trend|improv|score of/i);
  // The chart's own date labels use the shared mono day() format ("24 AUG"), not a d/m slash format.
  assert.equal((html.match(/24 AUG/g) ?? []).length, 2);
  assert.doesNotMatch(html, /\b24\/8\b/);
});

test('assigned form summary shows version and required count only; no schedule or response rate anywhere', () => {
  const html = renderToStaticMarkup(h(AssignedFormSummary, { status: 'ready', form: form(2), editing: false, onEdit: noop, onRetry: noop }));
  assert.match(html, /Weekly check-in/); assert.match(html, />V2</); assert.match(html, /2 questions · 1 required/); assert.match(html, />Edit form</);
  assert.equal(filled(html), 0);
  assert.match(renderToStaticMarkup(h(AssignedFormSummary, { status: 'ready', form: null, editing: false, onEdit: noop, onRetry: noop })), /No check-in form assigned\./);
  for (const file of ['src/components/care-support/PatientCheckIns.tsx', 'src/components/care-support/CheckInViews.tsx']) assert.doesNotMatch(read(file), /response rate|schedule|sent sundays/i, file);
  assert.match(read('src/components/care-support/FormEditor.tsx'), /label=\{`Save as v\$\{\(state\.savedVersion \?\? form\?\.version \?\? 0\) \+ 1\}`\}/);
});
