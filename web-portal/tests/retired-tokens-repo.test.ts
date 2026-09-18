import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Spec §8: "No reference anywhere to retired tokens". Runs from web-portal/ over the whole repository.
const REPO = resolve(process.cwd(), '..');
const TEXT = /\.(swift|ts|tsx|js|jsx|mjs|cjs|css|json|md|html|svg|py|sh|ya?ml|xcconfig|plist|pbxproj|entitlements|sql|prisma|toml|txt)$/;
// Records that name retired values on purpose: the spec's checklist and mockups, archived passes, past plans and their evidence.
const RECORDS = ['docs/design/letterpress/', 'docs/design/archive/', 'docs/superpowers/', 'docs/features/', 'docs/handoff/', '.superpowers/', '.claude/worktrees/'];
// The sweeps spell the patterns out; lockfiles are generated.
const SWEEPS = new Set(['ClearAFTests/LetterpressSweepTests.swift', 'web-portal/tests/letterpress-tokens.test.mjs', 'web-portal/tests/retired-tokens-repo.test.ts']);

const FILES = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf8' })
  .split('\0')
  .filter((path) => path && TEXT.test(path) && !path.endsWith('package-lock.json'))
  .filter((path) => !RECORDS.some((prefix) => path.startsWith(prefix)) && !SWEEPS.has(path))
  .filter((path) => existsSync(join(REPO, path)) && statSync(join(REPO, path)).isFile());

const RETIRED: { name: string; pattern: RegExp; exempt?: string }[] = [
  { name: '#0B4D45', pattern: /0B4D45/i },
  { name: '#C2552F', pattern: /C2552F/i },
  { name: 'skinPeach', pattern: /skinPeach/i },
  { name: 'calmBlue', pattern: /calmBlue/i },
  { name: 'gentleGreen', pattern: /gentleGreen/i },
  { name: 'softLavender', pattern: /softLavender/i },
  // Design-token names (scoreRing, scoreColor…). backend/ keeps the skin score columns and fields fenced by spec §0.
  { name: 'score*', pattern: /\bscore[A-Z]\w*/, exempt: 'backend/' },
  { name: 'glowShadow', pattern: /glowShadow/i },
  { name: 'any gradient', pattern: /gradient/i },
];

test('the sweep covers every live part of the repository', () => {
  for (const expected of ['ClearAF/Views/Letterpress.swift', 'web-portal/src/app/globals.css', 'backend/src/server.ts', 'docs/design/design-language.md', 'CLAUDE.md', 'ClearAF/Assets.xcassets/AppIcon.appiconset/Contents.json']) {
    assert.ok(FILES.includes(expected), `${expected} is not swept`);
  }
  assert.ok(!FILES.some((path) => path.startsWith('docs/superpowers/')));
});

for (const { name, pattern, exempt } of RETIRED) {
  test(`no reference to ${name} outside the records`, () => {
    const hits = FILES.filter((path) => !(exempt && path.startsWith(exempt))).flatMap((path) =>
      readFileSync(join(REPO, path), 'utf8')
        .split('\n')
        .flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1}: ${line.trim().slice(0, 140)}`] : [])),
    );
    assert.deepEqual(hits, []);
  });
}

test('the retired icon generator and the ChatGPT raster are deleted', () => {
  assert.ok(!existsSync(join(REPO, 'generate_icon.py')));
  assert.ok(!existsSync(join(REPO, 'ClearAF/Assets.xcassets/AppIcon.appiconset/ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png')));
});

test('the app icon declares light, dark and tinted 1024px PNGs (alpha only on tinted)', () => {
  const set = join(REPO, 'ClearAF/Assets.xcassets/AppIcon.appiconset');
  const { images } = JSON.parse(readFileSync(join(set, 'Contents.json'), 'utf8')) as {
    images: { filename: string; size: string; appearances?: { appearance: string; value: string }[] }[];
  };
  const byAppearance = Object.fromEntries(images.map((image) => [image.appearances?.[0]?.value ?? 'any', image]));
  assert.deepEqual(Object.keys(byAppearance).sort(), ['any', 'dark', 'tinted']);
  for (const [appearance, image] of Object.entries(byAppearance)) {
    assert.equal(image.size, '1024x1024');
    const bytes = readFileSync(join(set, image.filename));
    assert.equal(bytes.readUInt32BE(16), 1024, image.filename);
    assert.equal(bytes[25], appearance === 'tinted' ? 6 : 2, `${image.filename} colour type`);
  }
});
