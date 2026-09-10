import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, supabase, authStorage } from '../src/lib/api';
beforeEach(async () => {
  authStorage.beginLogin();
  const signIn = supabase.auth.signInWithPassword;
  supabase.auth.signInWithPassword = async () => { throw new Error('fixture reset'); };
  try { await assert.rejects(apiService.login('fixture@example.test', 'fixture'), /fixture reset/); }
  finally { supabase.auth.signInWithPassword = signIn; }
});
test('logout ends the Supabase session instead of leaving a usable session behind', async () => {
  let signedOut = false;
  const original = supabase.auth.signOut;
  supabase.auth.signOut = async () => { signedOut = true; return { error: null }; };
  try { await apiService.logout(); assert.equal(signedOut, true); assert.equal(apiService.isAuthenticated(), false); }
  finally { supabase.auth.signOut = original; }
});
test('a patient login is rejected and its Supabase session is ended', async () => {
  const signIn = supabase.auth.signInWithPassword;
  const signOut = supabase.auth.signOut;
  const profile = apiService.getCurrentUser;
  let signedOut = false;
  supabase.auth.signInWithPassword = async () => ({ data: { session: { access_token: 'test' }, user: { id: 'patient' } }, error: null }) as Awaited<ReturnType<typeof signIn>>;
  supabase.auth.signOut = async () => { signedOut = true; return { error: null }; };
  apiService.getCurrentUser = async () => ({ userType: 'patient' }) as unknown as Awaited<ReturnType<typeof profile>>;
  try { await assert.rejects(apiService.login('patient@example.test', 'test'), /dermatologist/); assert.equal(signedOut, true); }
  finally { supabase.auth.signInWithPassword = signIn; supabase.auth.signOut = signOut; apiService.getCurrentUser = profile; }
});
test('clinical requests bypass caches and do not send referrer information', async () => {
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  let config: RequestInit | undefined;
  supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
  globalThis.fetch = async (_input, options) => { config = options; return new Response(JSON.stringify({ user: { userType: 'dermatologist' } }), { status: 200 }); };
  try { await apiService.getCurrentUser(); assert.equal(config?.cache, 'no-store'); assert.equal(config?.referrerPolicy, 'no-referrer'); }
  finally { supabase.auth.getSession = getSession; globalThis.fetch = originalFetch; }
});
test('prescription and appointment list envelopes become portal paginated data', async () => {
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  supabase.auth.getSession = async () => ({ data: { session: null }, error: null });
  globalThis.fetch = async (input) => new Response(JSON.stringify({
    [String(input).includes('prescriptions') ? 'prescriptions' : 'appointments']: [{ id: 'record' }],
    pagination: { page: 1, limit: 10, total: 1, pages: 1 }
  }), { status: 200 });
  try {
    for (const result of [await apiService.getPrescriptions(), await apiService.getAppointments()]) {
      assert.equal(result.data[0].id, 'record'); assert.equal(result.pagination.totalPages, 1);
    }
  } finally { supabase.auth.getSession = getSession; globalThis.fetch = originalFetch; }
});
test('offline logout removes persisted Supabase credentials even when revocation returns an error', async () => {
  const key = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`;
  const values = new Map([[key, 'old-session'], [key + '-user', 'old-user'], [key + '-code-verifier', 'old-code']]);
  const browserStorage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: browserStorage } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: browserStorage });
  const original = supabase.auth.signOut;
  supabase.auth.signOut = async () => ({ error: new Error('offline') }) as Awaited<ReturnType<typeof original>>;
  try {
    await assert.rejects(apiService.logout(), /offline/);
    for (const storedKey of [key, key + '-user', key + '-code-verifier']) assert.equal(values.has(storedKey), false);
    assert.equal(apiService.isAuthenticated(), false);
    await assert.rejects(apiService.getCurrentUser(), /sign in again/);
  } finally {
    supabase.auth.signOut = original;
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else Reflect.deleteProperty(globalThis, 'window');
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
test('requests cannot use a session while remote signout is pending', async () => {
  const signOut = supabase.auth.signOut;
  let finish!: () => void;
  supabase.auth.signOut = () => new Promise(resolve => { finish = () => resolve({ error: null }); });
  try {
    const pending = apiService.logout();
    await assert.rejects(apiService.getCurrentUser(), /sign in again/);
    finish();
    await pending;
  } finally { supabase.auth.signOut = signOut; }
});
