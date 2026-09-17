import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../src/app/globals.css');
const tailwind = read('../tailwind.config.js');
const layout = read('../src/app/layout.tsx');

const SPEC = {
  light: { canvas:'#F2EFE7', surface:'#F9F7F1', rail:'#EDEAE1', sunk:'#E8E3D6', ink:'#121312', 'ink-secondary':'#56544D', 'ink-tertiary':'#5F5D55', 'ink-future':'#64625A', 'attention-mark':'#A6701F', 'attention-text':'#6E4709', 'attention-wash':'#F0E6D2', error:'#9A2015' },
  dark:  { canvas:'#171716', surface:'#1F201E', rail:'#1C1D1B', sunk:'#24251F', ink:'#EFEDE4', 'ink-secondary':'#A8A69C', 'ink-tertiary':'#8F8D84', 'ink-future':'#8B897E', 'attention-mark':'#D9A64A', 'attention-text':'#E8C48A', 'attention-wash':'#33291A', error:'#FFB3A6' },
};

const [lightBlock, darkBlock] = css.split('@media (prefers-color-scheme: dark)');
function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(\d{1,3}) (\d{1,3}) (\d{1,3});/g)]
    .map((m) => [m[1], '#' + m.slice(2, 5).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()]));
}
const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Text tokens allowed on each background. Dark-mode exclusions are documented in design-language.md.
const TEXT = ['ink', 'ink-secondary', 'ink-tertiary', 'ink-future', 'attention-text', 'error'];
const PAIRS = {
  canvas: TEXT, surface: TEXT, rail: TEXT,
  sunk: ['ink', 'ink-secondary', 'ink-tertiary', 'attention-text', 'error'],
  'attention-wash': ['ink', 'ink-secondary', 'attention-text', 'error'],
};

for (const [theme, block] of [['light', lightBlock], ['dark', darkBlock]]) {
  const t = tokens(block);
  test(`${theme} tokens equal the Letterpress spec values`, () => {
    for (const [name, hex] of Object.entries(SPEC[theme])) assert.equal(t[name], hex, name);
  });
  test(`${theme} permitted text pairs meet 4.5:1`, () => {
    for (const [bg, texts] of Object.entries(PAIRS)) for (const fg of texts)
      assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
  });
  test(`${theme} field boundary meets 3:1 on every paper tone`, () => {
    const m = tailwind.match(/field:\s*'rgb\(var\(--ink\)\s*\/\s*([\d.]+)\)'/);
    assert.ok(m, 'rule.field token not found in tailwind.config.js');
    const alpha = Number(m[1]);
    const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const toHex = (arr) => '#' + arr.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    const inkRgb = rgbOf(t.ink);
    for (const bg of ['canvas', 'surface', 'rail', 'sunk']) {
      const bgRgb = rgbOf(t[bg]);
      const composite = toHex(inkRgb.map((c, i) => alpha * c + (1 - alpha) * bgRgb[i]));
      assert.ok(contrast(composite, t[bg]) >= 3.0, `field boundary vs ${bg}: ${contrast(composite, t[bg]).toFixed(2)}`);
    }
  });
}

test('retired Care Journal and wellness values are gone', () => {
  for (const src of [css, tailwind]) for (const retired of [/0B4D45/i, /C2552F/i, /8B5CF6/i, /14B8A6/i, /clearaf['"]?\s*:/, /gray-custom/, /gradient/i, /--text-primary/, /--action-primary/])
    assert.doesNotMatch(src, retired);
});

test('Tailwind colours keep opacity modifiers working', () => {
  assert.match(tailwind, /ink:\s*{\s*DEFAULT:\s*'rgb\(var\(--ink\) \/ <alpha-value>\)'/);
  assert.match(tailwind, /canvas:\s*'rgb\(var\(--canvas\) \/ <alpha-value>\)'/);
});

test('fonts load through next/font with swap', () => {
  for (const f of ['Newsreader', 'IBM_Plex_Sans', 'IBM_Plex_Mono']) assert.match(layout, new RegExp(`\\b${f}\\(`));
  assert.equal((layout.match(/display:\s*'swap'/g) ?? []).length, 3);
  assert.match(css, /--font-display:\s*var\(--font-newsreader\)/);
});

test('focus ring is a 2px ink outline and radius is 4px', () => {
  assert.match(css, /:focus-visible\s*{\s*outline:\s*2px solid rgb\(var\(--ink\)\)/);
  assert.match(css, /--radius:\s*4px/);
});
