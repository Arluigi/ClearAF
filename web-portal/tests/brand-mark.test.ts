import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Lockup } from '../src/components/brand/Lockup';
import { Mark } from '../src/components/brand/Mark';
import { LOCKUP_HEIGHT, MARK, clearSpace, lockupGap, lockupWidth, markLayout, markStroke, showsWordmark, wordmarkSize } from '../src/components/brand/geometry';
import { MARK_GLYPH_PATH, WORDMARK_ADVANCE_EM } from '../src/components/brand/mark-glyphs';

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);

test('construction constants are the spec §10.2–10.5 numbers', () => {
  assert.equal(MARK.aspect, 0.8);
  assert.equal(MARK.monogramRatio, 0.39);
  assert.equal(MARK.rightInsetRatio, 0.19);
  assert.equal(MARK.bottomInsetRatio, 0.08);
  assert.equal(MARK.cornerRadius, 0);
  assert.equal(MARK.hairline, 0.75);
  assert.equal(MARK.clearSpaceRatio, 0.5);
  assert.equal(MARK.lockupGapRatio, 0.4);
  assert.ok(MARK.wordmarkTrackingEm >= 0.18 && MARK.wordmarkTrackingEm <= 0.2);
  assert.equal(MARK.lockupMinimumWidth, 96);
  assert.equal(MARK.iconFrameRatio, 0.52);
  assert.equal(MARK.iconLiftRatio, 0.015);
  assert.deepEqual(LOCKUP_HEIGHT, { rail: 25, signIn: 27 });
});

test('stroke follows the height bands', () => {
  near(markStroke(72), 2.016);
  near(markStroke(48), 1.344);
  assert.equal(markStroke(47), 1.5);
  near(markStroke(27), 1.35);
  near(markStroke(25), 1.25);
  near(markStroke(24), 1.2);
  assert.equal(markStroke(23), 0.75);
  assert.equal(markStroke(13), 0.75);
});

test('monogram sits 0.19 × width and 0.08 × H inside the rules; small marks use the block', () => {
  const rail = markLayout(25);
  near(rail.width, 20);
  near(rail.anchor.x, 14.95);
  near(rail.anchor.y, 21.75);
  near(rail.monogramSize, 9.75);
  assert.equal(rail.block, null);
  const large = markLayout(72);
  near(large.anchor.x, 44.64);
  near(large.anchor.y, 64.224);
  const favicon = markLayout(13);
  assert.ok(favicon.block);
  near(favicon.block.side, 4.03);
  near(favicon.block.x, 4.58);
  near(favicon.block.y, 7.18);
  assert.equal(markLayout(16).block, null);
});

test('lockup gap, clear space, wordmark size and the 96px minimum', () => {
  near(lockupGap(25), 10);
  near(clearSpace(27), 13.5);
  near(wordmarkSize(28), 21.84);
  near(lockupWidth(25), 104.451, 1e-3);
  assert.equal(showsWordmark(22), false);
  assert.equal(showsWordmark(23), true);
});

test('portal and iOS share one construction and one outline', () => {
  const geometry = readFileSync('../ClearAF/Views/Brand/LetterpressMarkGeometry.swift', 'utf8');
  const glyphs = readFileSync('../ClearAF/Views/Brand/LetterpressMarkGlyphs.swift', 'utf8');
  const swift = Object.fromEntries([...geometry.matchAll(/static let (\w+): CGFloat = ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(swift, { ...MARK });
  assert.equal(glyphs.match(/static let path = "([^"]+)"/)?.[1], MARK_GLYPH_PATH);
  assert.equal(Number(glyphs.match(/wordmarkAdvanceEm: CGFloat = ([\d.]+)/)?.[1]), WORDMARK_ADVANCE_EM);
  assert.match(MARK_GLYPH_PATH, /^M[MLQCZ\d. -]+Z$/);
});

test('mark: one colour from currentColor, filled ring, outline letters, no font or effects', () => {
  const html = renderToStaticMarkup(h(Mark, { height: 25 }));
  assert.match(html, /^<svg [^>]*width="20" height="25" viewBox="0 0 20 25" fill="currentColor"/);
  assert.match(html, /aria-hidden="true"/);
  assert.ok(html.includes('<path fill-rule="evenodd" d="M0 0H20V25H0ZM1.25 1.25H18.75V23.75H1.25Z"></path>'));
  assert.ok(html.includes(`d="${MARK_GLYPH_PATH}" transform="translate(14.95 21.75) scale(9.75)"`));
  assert.doesNotMatch(html, /<text|font-family|#[0-9a-f]{3,6}\b|stroke=|rx=|gradient|filter|opacity/i);
});

test('mark under the favicon floor draws the block and can carry a name', () => {
  const html = renderToStaticMarkup(h(Mark, { height: 13, title: 'ClearAF' }));
  assert.match(html, /role="img" aria-label="ClearAF"/);
  assert.ok(html.includes('<rect x="4.58" y="7.18" width="4.03" height="4.03"></rect>'));
  assert.ok(!html.includes(MARK_GLYPH_PATH));
});

test('lockup: mark, 0.4 × H gap, Newsreader 300 tracked 0.18em with italic af, one accessible name', () => {
  const html = renderToStaticMarkup(h(Lockup, { height: LOCKUP_HEIGHT.signIn }));
  assert.match(html, /^<div class="flex w-fit items-center" style="gap:10.8px">/);
  assert.match(html, /data-mark-height="27"/);
  assert.match(html, /<span aria-hidden="true" class="font-display font-light lowercase leading-none tracking-\[0.18em\]" style="font-size:21.06px">clear<span class="italic">af<\/span><\/span>/);
  assert.equal((html.match(/ClearAF/g) ?? []).length, 1);
  assert.match(html, /<span class="sr-only">ClearAF<\/span>/);
});

test('lockup below 96px wide is the mark alone', () => {
  const html = renderToStaticMarkup(h(Lockup, { height: 22, className: 'text-ink' }));
  assert.match(html, /^<svg [^>]*class="block text-ink" role="img" aria-label="ClearAF"/);
  assert.doesNotMatch(html, /clear<span/);
});
