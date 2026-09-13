const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deviceEnvironment, validateHost } = require('./device-local.cjs');
const baseline = { NODE_ENV: 'development', PORT: '3001', SUPABASE_URL: 'http://127.0.0.1:54321', DATABASE_URL: 'postgresql://local:synthetic@127.0.0.1:54322/postgres', DIRECT_URL: 'postgresql://local:synthetic@127.0.0.1:54322/postgres', SUPABASE_ANON_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' };
test('strict single-label Bonjour hostname', () => {
  assert.equal(validateHost('Aryans-MacBook-Pro.local'), 'Aryans-MacBook-Pro.local');
  for (const host of ['', 'https://Mac.local', 'Mac.local:3002', 'example.com', '-a.local', 'a-.local', 'a_.local', 'a.b.local', 'Mac.local\n', 'a'.repeat(64) + '.local']) assert.throws(() => validateHost(host));
});
test('only child API port and Supabase URL change; baseline untouched', () => {
  const before = structuredClone(baseline);
  const child = deviceEnvironment(baseline, 'Mac.local', ['192.168.1.10'], ['192.168.1.10']);
  assert.deepEqual(baseline, before);
  assert.deepEqual(child, { ...baseline, PORT: '3002', SUPABASE_URL: 'http://Mac.local:54321' });
});
test('fails closed on nonlocal config, mixed DNS or non-Mac resolution', () => {
  assert.throws(() => deviceEnvironment(baseline, 'Mac.local', ['192.168.1.11'], ['192.168.1.10']));
  assert.throws(() => deviceEnvironment(baseline, 'Mac.local', ['192.168.1.10', '8.8.8.8'], ['192.168.1.10']));
  assert.throws(() => deviceEnvironment(baseline, 'Mac.local', [], ['192.168.1.10']));
  for (const [key, value] of [['SUPABASE_URL', 'https://example.com'], ['DATABASE_URL', 'postgresql://user:password@example.com/db'], ['DIRECT_URL', 'postgresql://localhost/db?host=example.com'], ['NODE_ENV', 'production'], ['PORT', '3002']]) assert.throws(() => deviceEnvironment({ ...baseline, [key]: value }, 'Mac.local', ['192.168.1.10'], ['192.168.1.10']));
});
