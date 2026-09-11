import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, supabase, authStorage } from '../src/lib/api';
beforeEach(async () => {
  authStorage.beginLogin();
  supabase.auth.admin.signOut = async () => ({ data: null, error: null });
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
test('late clinical response and old multi-step facade are rejected after identity changes', async () => {
  const getSession = supabase.auth.getSession, originalFetch = globalThis.fetch;
  const session = { access_token: 'token-a', user: { id: 'A' } };
  apiService.acceptSession(session);
  const scoped = apiService.scoped();
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  let finish!: (response: Response) => void;
  let started!: () => void;
  const fetching = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async () => { started(); return new Promise<Response>(resolve => { finish = resolve; }); };
  try {
    const pending = scoped.getPatients();
    await fetching;
    apiService.acceptSession({ access_token: 'token-b', user: { id: 'B' } });
    finish(new Response(JSON.stringify({ patients: [{ id: 'private-a' }], total: 1 })));
    await assert.rejects(pending, /changed/);
    assert.throws(() => scoped.sendMessage({ receiverId: 'patient-a', content: 'old continuation' }), /changed/);
  } finally { supabase.auth.getSession = getSession; globalThis.fetch = originalFetch; }
});
test('an account switch discovered during token lookup never sends old work with the new token', async () => {
  const getSession = supabase.auth.getSession, originalFetch = globalThis.fetch;
  apiService.acceptSession({ access_token: 'token-a', user: { id: 'A' } });
  supabase.auth.getSession = async () => ({ data: { session: { access_token: 'token-b', user: { id: 'B' } } }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return new Response('{}'); };
  try { await assert.rejects(apiService.getPatients(), /changed/); assert.equal(fetched, false); }
  finally { supabase.auth.getSession = getSession; globalThis.fetch = originalFetch; }
});
test('profile network failure preserves a valid login for retry without granting clinical access', async () => {
  const signIn = supabase.auth.signInWithPassword, signOut = supabase.auth.signOut, profile = apiService.getCurrentUser;
  let signedOut = false;
  supabase.auth.signInWithPassword = async () => ({ data: { session: { access_token: 'test', user: { id: 'A' } }, user: { id: 'A' } }, error: null }) as Awaited<ReturnType<typeof signIn>>;
  supabase.auth.signOut = async () => { signedOut = true; return { error: null }; };
  apiService.getCurrentUser = async () => { throw new Error('Network unavailable'); };
  try { await assert.rejects(apiService.login('clinician@example.test', 'test'), /Network/); assert.equal(signedOut, false); assert.equal(apiService.isAuthenticated(), true); }
  finally { supabase.auth.signInWithPassword = signIn; supabase.auth.signOut = signOut; apiService.getCurrentUser = profile; }
});
test('logout persists its barrier before pending remote revocation and recovery never authenticates clinical access', async () => {
  const values = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } } } });
  const signOut = supabase.auth.signOut, revoke = supabase.auth.admin.signOut;
  let finish!: () => void;
  supabase.auth.signOut = async () => ({ error: null });
  supabase.auth.admin.signOut = () => new Promise(resolve => { finish = () => resolve({ data: null, error: null }); });
  try {
    apiService.acceptSession({ access_token: 'recovery-token', user: { id: 'A' } });
    authStorage.beginRecovery(); authStorage.confirmRecovery('A');
    assert.equal(apiService.isAuthenticated(), false);
    await assert.rejects(apiService.getPatients(), /recovery/);
    const pending = apiService.logout();
    assert.equal(authStorage.isLoggedOut(), true);
    assert.equal(authStorage.recoveryAccount(), null);
    assert.ok([...values.entries()].some(([key, value]) => key.endsWith('-logged-out') && value === 'true'));
    finish(); await pending;
  } finally {
    supabase.auth.signOut = signOut; supabase.auth.admin.signOut = revoke;
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window');
  }
});
