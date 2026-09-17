'use client';
import { useState } from 'react';
import AuthShell from '@/components/layout/AuthShell';
import { supabase } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  return <AuthShell eyebrow="Password recovery" title="Reset your password">
    <form className="space-y-6" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage('');
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMessage('If an account matches this email, you will receive a password reset link. Open it in this browser.');
      } catch { setMessage('Unable to send the reset request. Check your connection and try again.'); }
      finally { setBusy(false); }
    }}>
      <div className="space-y-1.5"><Label htmlFor="email">Account email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
      <a href="/login" className="text-sm underline underline-offset-[3px]">Return to sign in</a>
    </form>
  </AuthShell>;
}
