'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('password') === 'updated') setNotice('Password updated. Sign in with your new password.');
    if (params.get('logout') === 'revocation-failed') {
      setError('You are signed out on this browser. The server could not confirm session revocation; sign in again when your connection is available.');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.push('/patients');
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
      router.push('/patients');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed. Check your details and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = email.trim() !== '' && password.length >= 6;

  return (
    <AuthShell eyebrow="Clinician portal" title="Sign in">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@practice.example" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-14" required />
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-secondary underline underline-offset-[3px] hover:text-ink"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && <p role="alert" className="border-l-2 border-error pl-3 text-sm text-error">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!isFormValid || isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
        {!isFormValid && !isLoading && <p className="text-xs text-ink-secondary">Enter your work email and password to continue.</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a className="underline underline-offset-[3px]" href="/forgot-password">Forgot password</a>
          <a className="underline underline-offset-[3px]" href="/register">Request practice access</a>
        </div>
      </form>
    </AuthShell>
  );
}
