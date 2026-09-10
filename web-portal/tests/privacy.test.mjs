import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []))).flat();
}
test('portal never sends identities to avatar services or writes clinical data to console', async () => {
  for (const file of await sourceFiles('src')) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /api\.dicebear\.com|ui-avatars\.com|console\.(log|error|debug|info)/, file);
  }
});
test('portal does not advertise unverified compliance', async () => {
  for (const file of await sourceFiles('src')) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /HIPAA compliant|HIPAA Compliant|All data is encrypted/i, file);
  }
});
