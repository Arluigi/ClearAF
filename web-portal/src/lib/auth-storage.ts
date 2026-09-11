type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class LocalSessionCleanupError extends Error {
  constructor() {
    super('Unable to clear browser sign-in data. Close this browser and clear its site data before using a shared device.');
  }
}

export function createAuthStorage(storageKey: string, getStorage: () => AuthStorage | null) {
  const logoutKey = `${storageKey}-logged-out`;
  let loggedOut = false;
  const isLoggedOut = () => loggedOut || getStorage()?.getItem(logoutKey) === 'true';
  return {
    isLoggedOut,
    recoveryAccount() { return getStorage()?.getItem(`${storageKey}-recovery`) ?? null; },
    beginRecovery() { getStorage()?.setItem(`${storageKey}-recovery`, 'pending'); },
    confirmRecovery(account: string) { getStorage()?.setItem(`${storageKey}-recovery`, account); },
    getItem(key: string) {
      return key !== `${storageKey}-code-verifier` && isLoggedOut() ? null : getStorage()?.getItem(key) ?? null;
    },
    setItem(key: string, value: string) {
      // A refresh already in flight must not restore a session after logout.
      if (key === `${storageKey}-code-verifier` || !isLoggedOut()) getStorage()?.setItem(key, value);
    },
    removeItem(key: string) {
      getStorage()?.removeItem(key);
    },
    beginLogin() {
      getStorage()?.removeItem(logoutKey);
      loggedOut = false;
    },
    clearSession() {
      loggedOut = true;
      let failed = false;
      try { getStorage()?.setItem(logoutKey, 'true'); } catch { failed = true; }
      for (const key of [storageKey, `${storageKey}-user`, `${storageKey}-code-verifier`, 'auth_token', `${storageKey}-recovery`]) {
        try { getStorage()?.removeItem(key); } catch { failed = true; }
      }
      if (failed) throw new LocalSessionCleanupError();
    },
  };
}
