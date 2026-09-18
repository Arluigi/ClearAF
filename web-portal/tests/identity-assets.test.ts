import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { LOCKUP_HEIGHT, clearSpace } from '../src/components/brand/geometry';
import { offences, read, sourceFiles } from './letterpress-rules';

const png = (path: string) => {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] };
};

test('Next.js default SVGs are gone; favicon.svg and a 180px opaque apple-touch-icon are in public', () => {
  for (const name of ['next.svg', 'vercel.svg', 'file.svg', 'globe.svg', 'window.svg']) assert.ok(!existsSync(`public/${name}`), name);
  assert.deepEqual(png('public/apple-touch-icon.png'), { width: 180, height: 180, colourType: 2 });
});

test('favicon.svg is the block mark in ink, reversed for dark browser chrome, and nothing else', () => {
  const svg = read('public/favicon.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 18 18">/);
  assert.ok(svg.includes('path{fill:#121312}@media (prefers-color-scheme:dark){path{fill:#EFEDE4}}'));
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  // No linear/radial fill ramp, text, image, stroke, filter, radius or opacity.
  assert.doesNotMatch(svg, /<linear|<radial|<text|<image|stroke|filter|rx=|opacity/i);
});

test('favicon.ico holds one 32px PNG', () => {
  const ico = readFileSync('src/app/favicon.ico');
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(ico.readUInt32LE(18), 22);
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a');
  assert.equal(ico.readUInt32BE(22 + 16), 32);
  assert.equal(ico.readUInt32BE(22 + 20), 32);
});

test('root metadata links favicon.svg and the apple-touch-icon', () => {
  const layout = read('src/app/layout.tsx');
  assert.ok(layout.includes("icons: {\n    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],\n    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],\n  },"));
});

test('the lockup replaces every placeholder mark, with clear space around it', () => {
  const sources = sourceFiles('src');
  assert.deepEqual(offences(/Stethoscope/, sources), []);
  assert.deepEqual(offences(/data-placeholder="wordmark"/, sources), []);

  const sidebar = read('src/components/layout/Sidebar.tsx');
  assert.match(sidebar, /import \{ Lockup \} from '@\/components\/brand\/Lockup';/);
  assert.match(sidebar, /<div className="px-4 pb-5 pt-6">\s*<Lockup height=\{LOCKUP_HEIGHT\.rail\} className="text-ink" \/>\s*<p className="eyebrow mt-3\.5">Clinician<\/p>/);
  // px-4 = 16px, pt-6 = 24px, mt-3.5 = 14px: each at least 0.5 × H.
  for (const px of [16, 24, 14]) assert.ok(px >= clearSpace(LOCKUP_HEIGHT.rail), `${px}px`);

  const shell = read('src/components/layout/AuthShell.tsx');
  assert.match(shell, /<div className="flex w-full flex-col px-6 py-8[^"]*">\s*<Lockup height=\{LOCKUP_HEIGHT\.signIn\} className="text-ink" \/>/);
  // px-6 = 24px and py-8 = 32px around the lockup; the next block adds py-10.
  for (const px of [24, 32]) assert.ok(px >= clearSpace(LOCKUP_HEIGHT.signIn), `${px}px`);
});
