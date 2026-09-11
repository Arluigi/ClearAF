'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  return <main className="min-h-screen flex items-center justify-center p-6"><form className="max-w-md w-full space-y-5" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      setMessage('If an account matches this email, you will receive a password reset link. Open it in this browser.');
    } catch { setMessage('Unable to send the reset request. Check your connection and try again.'); }
    finally { setBusy(false); }
  }}><h1 className="text-2xl font-bold">Reset your password</h1><label htmlFor="email">Account email</label><Input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /><Button disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>{message && <p role="status">{message}</p>}<p><Link href="/login" className="underline">Return to sign in</Link></p></form></main>;
}
