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
test('requesting recovery can retain PKCE verifier without lifting offline logout tombstone', () => {
  const storage = memoryStorage(); const adapter = createAuthStorage('auth', () => storage);
  adapter.clearSession(); adapter.setItem('auth-code-verifier', 'recovery-verifier'); adapter.setItem('auth', 'stale-refresh');
  assert.equal(adapter.isLoggedOut(), true); assert.equal(adapter.getItem('auth'), null);
  assert.equal(adapter.getItem('auth-code-verifier'), 'recovery-verifier');
});
test('recovery barrier survives reload and records the validated account until explicit logout', () => {
  const storage = memoryStorage(); const adapter = createAuthStorage('auth', () => storage);
  adapter.beginRecovery(); assert.equal(adapter.recoveryAccount(), 'pending');
  adapter.confirmRecovery('account-a');
  assert.equal(createAuthStorage('auth', () => storage).recoveryAccount(), 'account-a');
  adapter.clearSession(); assert.equal(adapter.recoveryAccount(), null);
});
