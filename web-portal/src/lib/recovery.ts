import { createClient } from '@supabase/supabase-js';
import { apiService, authStorage, authStorageKey, sessionBoundary } from './api';
import { LocalSessionCleanupError } from './auth-storage';
import { recoveryCallback } from './session-boundary';

// Recovery uses an isolated SDK instance. Its delayed exchanges cannot replace
// the ordinary browser session or consume a later attempt's PKCE verifier.
export const recoveryClients = {
  create() {
    const memory = new Map<string, string>();
    // A distinct key also isolates Supabase cross-tab BroadcastChannel events.
    const recoveryKey = `${authStorageKey}-recovery-${crypto.randomUUID()}`;
    const key = `${authStorageKey}-code-verifier`;
    const verifier = authStorage.getItem(key);
    if (verifier) memory.set(`${recoveryKey}-code-verifier`, verifier);
    authStorage.removeItem(key);
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { storageKey: recoveryKey, flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: false,
        storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); } } }
    });
  }
};
let callbackAttempt: Promise<number> | undefined;
let recoveryAttempt = 0;
let activeClient: ReturnType<typeof recoveryClients.create> | undefined;
export async function cancelRecovery() {
  recoveryAttempt++;
  callbackAttempt = undefined;
  const previous = activeClient;
  activeClient = undefined;
  const localLogout = apiService.logout(); // synchronous persistent barrier first
  const recoveryLogout = previous?.auth.signOut({ scope: 'local' });
  const results = await Promise.allSettled([localLogout, recoveryLogout]);
  for (const result of results) {
    if (result.status === 'rejected' && result.reason instanceof LocalSessionCleanupError) throw result.reason;
  }
  return results.some(result => result.status === 'rejected' || (result.value && result.value.error));
}
export function consumeRecoveryCallback(url: string): Promise<number> {
  if (callbackAttempt) return callbackAttempt;
  const attempt = ++recoveryAttempt;
  callbackAttempt = (async () => {
    const callback = recoveryCallback(url);
    if (callback.kind === 'invalid') {
      if (authStorage.recoveryAccount()) await cancelRecovery();
      throw new Error('This reset link is invalid or expired. Request a new link.');
    }
    authStorage.beginRecovery();
    sessionBoundary.invalidate();
    const generation = sessionBoundary.snapshot();
    const ownsAttempt = () => attempt === recoveryAttempt && generation === sessionBoundary.snapshot() && authStorage.recoveryAccount() === 'pending';
    const client = recoveryClients.create();
    activeClient = client;
    try {
      const result = await client.auth.exchangeCodeForSession(callback.code);
      if (!ownsAttempt()) {
        // Only this isolated client is retired; a newer attempt remains untouched.
        void client.auth.signOut({ scope: 'local' }).catch(() => {});
        throw new Error('Password recovery was cancelled. Request a new link.');
      }
      if (result.error || !result.data.session) throw new Error('This reset link is invalid or expired. Request a new link in this browser.');
      authStorage.confirmRecovery(result.data.session.user.id);
      return sessionBoundary.snapshot();
    } catch (cause) {
      if (ownsAttempt()) await cancelRecovery();
      throw cause;
    }
  })();
  return callbackAttempt;
}
export async function updateRecoveredPassword(password: string, generation: number) {
  sessionBoundary.assert(generation);
  const client = activeClient;
  if (!client) throw new Error('Request a new reset link.');
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  sessionBoundary.assert(generation);
  if (sessionError || !session || authStorage.recoveryAccount() !== session.user.id) throw new Error('Recovery session changed or expired. Request a new reset link.');
  const { error } = await client.auth.updateUser({ password });
  sessionBoundary.assert(generation);
  if (error) throw error;
  return cancelRecovery();
}
