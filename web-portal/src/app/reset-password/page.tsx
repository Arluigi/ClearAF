'use client';
import { useEffect, useState } from 'react';
import AuthShell from '@/components/layout/AuthShell';
import { consumeRecoveryCallback, updateRecoveredPassword, cancelRecovery } from '@/lib/recovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  return <AuthShell eyebrow="Password recovery" title="Choose a new password">
    <div className="space-y-6">
      {error && <p role="alert" className="border-l-2 border-error pl-3 text-sm text-error">{error}</p>}
      {generation === null ? <p role="status" className="text-sm text-ink-secondary">{error ? 'Request a new reset link to continue.' : 'Checking your reset link'}</p> : <form className="space-y-6" onSubmit={async event => {
        event.preventDefault(); setError('');
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        setBusy(true);
        try { const revocationFailed = await updateRecoveredPassword(password, generation); window.location.replace(`/login?password=updated${revocationFailed ? '&logout=revocation-failed' : ''}`); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your password. Request a new link and try again.'); }
        finally { setBusy(false); }
      }}>
        <div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /><p className="text-xs text-ink-secondary">At least 8 characters.</p></div>
        <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} /></div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
      </form>}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <button type="button" disabled={busy} onClick={() => void leave('/forgot-password')} className="underline underline-offset-[3px] disabled:text-ink-tertiary">Request a new reset link</button>
        <button type="button" disabled={busy} onClick={() => void leave('/login')} className="underline underline-offset-[3px] disabled:text-ink-tertiary">Cancel and return to sign in</button>
      </div>
    </div>
  </AuthShell>;
}
