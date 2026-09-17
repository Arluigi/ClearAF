'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

// Profile only (owner decision 1): the other Account controls in the mockup have no backing capability yet.
export default function AccountPage() {
  const { user, logout } = useAuth();
  const rows = [
    { label: 'Display name', value: user?.name },
    { label: 'Specialization', value: user?.specialization },
    { label: 'Work email', value: user?.email },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  return <DashboardLayout title="Account"><div className="portal-page max-w-2xl">
    <header className="space-y-1">
      <h1 className="editorial-title text-[32px]">Account</h1>
    </header>
    <section aria-label="Profile" className="space-y-3">
      <p className="eyebrow">Profile</p>
      <dl className="divide-y divide-rule border-y-2 border-ink">
        {rows.map(row => <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <dt className="eyebrow pt-1">{row.label}</dt>
          <dd className="break-words text-[15px] font-medium">{row.value}</dd>
        </div>)}
      </dl>
      <p className="text-sm text-ink-secondary">These details come from your verified clinician profile.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild><a href="/forgot-password">Change password</a></Button>
        <Button variant="outline" onClick={() => void logout()}>Sign out</Button>
      </div>
      <p className="text-xs text-ink-secondary">Change password sends a reset email to your work address.</p>
    </section>
  </div></DashboardLayout>;
}
