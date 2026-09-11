'use client';
import { useEffect, useState } from 'react';
import { consumeRecoveryCallback, updateRecoveredPassword, cancelRecovery } from '@/lib/recovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function ResetPasswordPage() {
  const [generation, setGeneration] = useState<number | null>(null), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const attempt = consumeRecoveryCallback(window.location.href);
    window.history.replaceState(null, '', '/reset-password');
    void attempt.then(value => { if (active) setGeneration(value); }, cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);
  const leave = async (path: string) => {
    setBusy(true);
    try { await cancelRecovery(); window.location.replace(path); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to clear recovery.'); setBusy(false); }
  };
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="max-w-md w-full space-y-5"><h1 className="text-2xl font-bold">Choose a new password</h1>{error && <p role="alert">{error}</p>}{generation === null ? <p>{error ? 'Request a new reset link to continue.' : 'Checking your reset link…'}</p> : <form className="space-y-5" onSubmit={async event => {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { const revocationFailed = await updateRecoveredPassword(password, generation); window.location.replace(`/login?password=updated${revocationFailed ? '&logout=revocation-failed' : ''}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your password. Request a new link and try again.'); }
    finally { setBusy(false); }
  }}><label htmlFor="password">New password (at least 8 characters)</label><Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /><label htmlFor="confirm">Confirm password</label><Input id="confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} /><Button disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button></form>}<p><button disabled={busy} onClick={() => void leave('/forgot-password')} className="underline">Request a new reset link</button></p><p><button disabled={busy} onClick={() => void leave('/login')} className="underline">Cancel and return to sign in</button></p></section></main>;
}
