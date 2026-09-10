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
    getItem(key: string) {
      return isLoggedOut() ? null : getStorage()?.getItem(key) ?? null;
    },
    setItem(key: string, value: string) {
      // A refresh already in flight must not restore a session after logout.
      if (!isLoggedOut()) getStorage()?.setItem(key, value);
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
      for (const key of [storageKey, `${storageKey}-user`, `${storageKey}-code-verifier`, 'auth_token']) {
        try { getStorage()?.removeItem(key); } catch { failed = true; }
      }
      if (failed) throw new LocalSessionCleanupError();
    },
  };
}
