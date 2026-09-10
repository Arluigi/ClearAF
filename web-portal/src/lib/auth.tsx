'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Dermatologist } from '@/types/api';
import { apiService, supabase, authStorage } from '@/lib/api';
import { LocalSessionCleanupError } from '@/lib/auth-storage';

interface AuthContextType {
  user: Dermatologist | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    specialization?: string;
    licenseNumber?: string;
    yearsOfExperience?: number;
  }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Dermatologist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logoutError, setLogoutError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);

  const isAuthenticated = !!user && apiService.isAuthenticated();

  const login = async (email: string, password: string) => {
    try {
      const response = await apiService.login(email, password);
      setUser(response.user);
    } catch (error) {

      throw error;
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    specialization?: string;
    licenseNumber?: string;
    yearsOfExperience?: number;
  }) => {
    try {
      const response = await apiService.register(data);
      setUser(response.user);
    } catch (error) {

      throw error;
    }
  };

  const logout = async () => {
    setLogoutPending(true);
    try {
      await apiService.logout();
      setUser(null);
    } catch (error) {
      setUser(null);
      if (error instanceof LocalSessionCleanupError) {
        setLogoutError(error.message);
        return;
      }
      window.location.replace('/login?logout=revocation-failed');
      return;
    }
    window.location.replace('/login');
  };

  const refreshUser = async () => {
    try {
      await apiService.initializeAuth();
      setUser(apiService.isAuthenticated() ? await apiService.getCurrentUser() : null);
    } catch {
      setUser(null);
      await apiService.logout().catch(() => {});
    }
  };

  useEffect(() => {
    let active = true;
    const initAuth = async () => {
      try {
        await apiService.initializeAuth();
        const currentUser = apiService.isAuthenticated() ? await apiService.getCurrentUser() : null;
        if (active) setUser(currentUser);
      } catch {
        if (active) setUser(null);
        await apiService.logout().catch(() => {});
      } finally {
        if (active) setIsLoading(false);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && active) {
        setUser(null);
      }
    });
    const handleStorage = () => {
      if (authStorage.isLoggedOut()) window.location.replace('/login');
    };
    window.addEventListener('storage', handleStorage);
    void initAuth();
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {logoutError ? <div role="alert" className="p-8">{logoutError}</div> : logoutPending ? <div role="status" className="p-8">Signing out…</div> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for protecting routes
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      // Redirect to login page
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return null;
    }

    return <Component {...props} />;
  };
}
