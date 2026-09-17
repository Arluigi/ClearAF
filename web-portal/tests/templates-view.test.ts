import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { templateSummary, templateVersionNote, type Template } from '../src/lib/care-support';
import { TemplateTable } from '../src/components/care-support/TemplateTable';
import { read } from './letterpress-rules';

const template = (over: Partial<Template> = {}): Template => ({
  id: 't1', revisionId: 'r1', version: 3, name: 'Acne · maintenance AM', isActive: true, updatedAt: '2026-09-02T10:00:00',
  steps: [{ title: 'Cleanser', instructions: '' }, { title: 'Adapalene', instructions: '' }, { title: 'SPF 30', instructions: '' }], ...over,
});

test('template helpers: step titles as the summary; the version note says what saving creates', () => {
  assert.equal(templateSummary(template()), 'Cleanser · Adapalene · SPF 30');
  assert.equal(templateSummary(template({ steps: [] })), 'No steps');
  assert.equal(templateSummary(template({ steps: Array.from({ length: 12 }, (_, i) => ({ title: `Step number ${i}`, instructions: '' })) })).length, 60);
  assert.equal(templateVersionNote(3, true), 'V3 · editing creates v4');
  assert.equal(templateVersionNote(1, false), 'V1 · archived · editing creates v2');
  assert.equal(templateVersionNote(null, true), 'New · saving creates v1');
});

test('templates table: name, version and updated columns only; the open template row is selected; archived in words', () => {
  const html = renderToStaticMarkup(h(TemplateTable, { templates: [template(), template({ id: 't2', name: 'Rosacea · gentle AM', version: 1, isActive: false, updatedAt: '2026-08-11T09:00:00' })], page: 2, selectedId: 't1' }));
  assert.deepEqual([...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1]), ['Name', 'Version', 'Updated']);
  assert.doesNotMatch(html, /In use/);
  assert.match(html, /<tr[^>]*data-state="selected"[^>]*>[\s\S]*Acne · maintenance AM/);
  assert.match(html, /href="\/templates\?page=2&amp;id=t1" aria-current="true"/);
  assert.match(html, /Cleanser · Adapalene · SPF 30/);
  assert.match(html, /Archived 11 AUG/);
  assert.match(html, />V3</); assert.match(html, />02 SEP</);
});

test('template editor saves as the next version and archives by saving; no active checkbox; one filled action on the page', () => {
  const editor = read('src/components/care-support/TemplateEditor.tsx');
  assert.match(editor, /label=\{`Save as v\$\{\(version \?\? 0\) \+ 1\}`\}/);
  assert.match(editor, />Archive</); assert.match(editor, />Restore</); assert.match(editor, /saveAs\(false\)/); assert.match(editor, /saveAs\(true\)/);
  assert.doesNotMatch(editor, /type="checkbox"/);
  const page = read('src/app/templates/page.tsx');
  assert.match(page, /variant=\{editorOpen \? "outline" : "default"\}/);
  assert.match(page, /<TemplateTable /);
  assert.doesNotMatch(page, /In use/);
});
