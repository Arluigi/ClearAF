import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, authStorage, supabase, sessionBoundary } from '../src/lib/api';
import { consumeRecoveryCallback, updateRecoveredPassword, cancelRecovery, recoveryClients } from '../src/lib/recovery';
const originalFactory = recoveryClients.create;
const original = { signIn: supabase.auth.signInWithPassword, signOut: supabase.auth.signOut, revoke: supabase.auth.admin.signOut, exchange: supabase.auth.exchangeCodeForSession, getSession: supabase.auth.getSession, update: supabase.auth.updateUser };
const session = { access_token: 'recovery-token', user: { id: 'A' } };
beforeEach(async () => {
  recoveryClients.create = () => supabase;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
  supabase.auth.signOut = async () => ({ error: null });
  supabase.auth.admin.signOut = async () => ({ data: null, error: null });
  await cancelRecovery();
  supabase.auth.signInWithPassword = async () => { throw new Error('reset'); };
  await assert.rejects(apiService.login('fixture@example.test', 'fixture'), /reset/);
  supabase.auth.exchangeCodeForSession = async () => ({ data: { session, user: session.user }, error: null }) as Awaited<ReturnType<typeof original.exchange>>;
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof original.getSession>>;
});
afterEach(() => {
  recoveryClients.create = originalFactory;
  supabase.auth.signInWithPassword = original.signIn; supabase.auth.signOut = original.signOut; supabase.auth.admin.signOut = original.revoke;
  supabase.auth.exchangeCodeForSession = original.exchange; supabase.auth.getSession = original.getSession; supabase.auth.updateUser = original.update;
  Reflect.deleteProperty(globalThis, 'window');
});
test('validated recovery stays isolated and a successful password update ends its session', async () => {
  const generation = await consumeRecoveryCallback('https://portal.test/reset-password?code=valid');
  assert.equal(authStorage.recoveryAccount(), 'A'); assert.equal(apiService.isAuthenticated(), false);
  let updated = false;
  supabase.auth.updateUser = async () => { updated = true; return { data: { user: session.user }, error: null } as Awaited<ReturnType<typeof original.update>>; };
  await updateRecoveredPassword('new-password', generation);
  assert.equal(updated, true); assert.equal(authStorage.isLoggedOut(), true); assert.equal(authStorage.recoveryAccount(), null);
});
test('expired callback clears any recovery session instead of allowing ordinary authentication', async () => {
  supabase.auth.exchangeCodeForSession = async () => ({ data: { session: null, user: null }, error: new Error('expired') }) as Awaited<ReturnType<typeof original.exchange>>;
  await assert.rejects(consumeRecoveryCallback('https://portal.test/reset-password?code=expired'), /invalid or expired/);
  assert.equal(authStorage.isLoggedOut(), true); assert.equal(apiService.isAuthenticated(), false);
});
test('a persisted recovery session cannot resume from a scrubbed URL after reload', async () => {
  authStorage.beginRecovery(); authStorage.confirmRecovery('A');
  await assert.rejects(consumeRecoveryCallback('https://portal.test/reset-password'), /invalid or expired/);
  assert.equal(authStorage.isLoggedOut(), true); assert.equal(authStorage.recoveryAccount(), null);
});
test('a cancelled delayed exchange cannot clear a newer recovery attempt', async () => {
  let finishFirst!: (value: unknown) => void;
  const firstExchange = new Promise(resolve => { finishFirst = resolve; });
  const first = { auth: { exchangeCodeForSession: () => firstExchange, signOut: async () => ({ error: null }) } } as unknown as typeof supabase;
  const b = { access_token: 'second-recovery-token', user: { id: 'B' } };
  const second = { auth: { exchangeCodeForSession: async () => ({ data: { session: b }, error: null }), signOut: async () => ({ error: null }) } } as unknown as typeof supabase;
  recoveryClients.create = () => first;
  const old = consumeRecoveryCallback('https://portal.test/reset-password?code=old');
  const oldRejected = assert.rejects(old, /cancelled/);
  await cancelRecovery();
  recoveryClients.create = () => second;
  const generation = await consumeRecoveryCallback('https://portal.test/reset-password?code=new');
  finishFirst({ data: { session }, error: null });
  await oldRejected;
  assert.equal(authStorage.recoveryAccount(), 'B');
  assert.equal(typeof generation, 'number');
  assert.equal(apiService.isAuthenticated(), false);
});

test('a cross-tab logout cannot be undone by a delayed recovery exchange', async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  recoveryClients.create = () => ({ auth: { exchangeCodeForSession: () => pending, signOut: async () => ({ error: null }) } }) as unknown as typeof supabase;
  const result = consumeRecoveryCallback('https://portal.test/reset-password?code=old');
  const rejected = assert.rejects(result, /cancelled/);
  authStorage.clearSession();
  sessionBoundary.invalidate();
  finish({ data: { session }, error: null });
  await rejected;
  assert.equal(authStorage.recoveryAccount(), null);
  assert.equal(authStorage.isLoggedOut(), true);
});
