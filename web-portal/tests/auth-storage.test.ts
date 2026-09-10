import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthStorage } from '../src/lib/auth-storage';
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
test('local logout removes stored credentials and blocks stale refresh writes across reloads', () => {
  const storage = memoryStorage();
  const adapter = createAuthStorage('auth', () => storage);
  for (const key of ['auth', 'auth-user', 'auth-code-verifier']) adapter.setItem(key, 'sensitive');
  adapter.clearSession();
  for (const key of ['auth', 'auth-user', 'auth-code-verifier']) assert.equal(storage.getItem(key), null);
  adapter.setItem('auth', 'late-refresh');
  assert.equal(storage.getItem('auth'), null);
  const reloaded = createAuthStorage('auth', () => storage);
  assert.equal(reloaded.isLoggedOut(), true);
  assert.equal(reloaded.getItem('auth'), null);
  reloaded.beginLogin();
  reloaded.setItem('auth', 'new-session');
  assert.equal(reloaded.getItem('auth'), 'new-session');
});
