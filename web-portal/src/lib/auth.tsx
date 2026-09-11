'use client';

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore, useMemo, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Dermatologist } from '@/types/api';
import { apiService, sessionBoundary, authStorage, authStorageKey } from '@/lib/api';
import { LocalSessionCleanupError } from '@/lib/auth-storage';

interface AuthContextType {
  user: Dermatologist | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const generation = useSyncExternalStore(sessionBoundary.subscribe, sessionBoundary.snapshot, () => 0);
  const pathname = usePathname();
  const explicitLogin = useRef(false);
  const recoveryAccount = authStorage.recoveryAccount();
  const publicPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
  const [verified, setVerified] = useState<{ generation: number; user: Dermatologist | null } | null>(null);
  const [error, setError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setError(''); setLoading(true);
    let attempt = sessionBoundary.snapshot();
    try {
      await apiService.initializeAuth();
      attempt = sessionBoundary.snapshot();
      const user = apiService.isAuthenticated() ? await apiService.getCurrentUser() : null;
      sessionBoundary.assert(attempt);
      setVerified({ generation: attempt, user });
    } catch (cause) {
      if (attempt === sessionBoundary.snapshot()) {
        setVerified(null);
        setError(cause instanceof Error ? cause.message : 'Unable to verify your account.');
      }
    } finally { if (attempt === sessionBoundary.snapshot()) setLoading(false); }
  }, []);

  useEffect(() => {
    // Recovery credentials are consumed only by the dedicated recovery screen.
    if (explicitLogin.current) return;
    if (pathname === '/reset-password') { setLoading(false); return; }
    void refreshUser();
  }, [generation, pathname, refreshUser]);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === authStorageKey || event.key === `${authStorageKey}-logged-out` || event.key === `${authStorageKey}-recovery` || event.key === null) {
        // Even before Supabase's cross-tab event arrives, unmount all old work.
        sessionBoundary.invalidate();
        if (authStorage.isLoggedOut()) apiService.acceptSession(null);
      }
    };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, []);
  const login = async (email: string, password: string) => {
    explicitLogin.current = true;
    try {
      await apiService.login(email, password);
      await refreshUser();
    } finally { explicitLogin.current = false; }
  };
  const logout = async () => {
    setLogoutPending(true); setVerified(null);
    try { await apiService.logout(); }
    catch (cause) {
      if (cause instanceof LocalSessionCleanupError) { setLogoutError(cause.message); return; }
      window.location.replace('/login?logout=revocation-failed'); return;
    }
    window.location.replace('/login');
  };
  const user = verified?.generation === generation ? verified.user : null;
  const isAuthenticated = !!user && apiService.isAuthenticated();
  const isLoading = loading || (!error && verified?.generation !== generation);
  const value = { user, isLoading, isAuthenticated, login, logout, refreshUser };
  let content = children;
  if (logoutError) content = <div role="alert" className="p-8">{logoutError}</div>;
  else if (logoutPending) content = <div role="status" className="p-8">Signing out…</div>;
  else if (recoveryAccount && pathname !== '/reset-password') content = <div className="p-8 space-y-4"><p>Password recovery is in progress. Finish recovery or cancel it before signing in.</p><a href="/reset-password" className="underline">Continue recovery</a><button className="ml-6" onClick={() => void logout()}>Cancel recovery and sign out</button></div>;
  else if (!publicPage && error) content = <div className="p-8 space-y-4"><p role="alert">We could not verify your account. {error}</p><button onClick={() => void refreshUser()}>Retry</button><button className="ml-6" onClick={() => void logout()}>Sign out</button></div>;
  else if (!publicPage && isLoading) content = <div role="status" className="p-8">Verifying your account…</div>;
  else if (!publicPage && !isAuthenticated) content = <div className="p-8"><a href="/login">Sign in to continue</a></div>;
  return <AuthContext.Provider value={value}><React.Fragment key={publicPage ? "public-auth" : generation}>{content}</React.Fragment></AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
// Every mounted clinical component retains its own generation-bound API facade.
// Old continuations cannot start a second request with a newly signed-in account.
export function useClinicalAPI() { return useMemo(() => apiService.scoped(), []); }
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading || !isAuthenticated) return null;
    return <Component {...props} />;
  };
}
