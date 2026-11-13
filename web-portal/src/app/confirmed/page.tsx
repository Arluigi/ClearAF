import type { Metadata } from 'next';
import { Lockup } from '@/components/brand/Lockup';
import { LOCKUP_HEIGHT } from '@/components/brand/geometry';

export const metadata: Metadata = {
  title: 'Email confirmed · UNZIT',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ConfirmedPage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-ink sm:px-12">
      <div className="mx-auto max-w-lg">
        <Lockup height={LOCKUP_HEIGHT.signIn} className="text-ink" />
        <div className="mt-16 space-y-6 border-t-2 border-ink pt-6">
          <h1 className="editorial-title text-[34px]">Your email is confirmed</h1>
          <p>Return to the UNZIT app and sign in to continue your enrollment.</p>
          <p className="text-sm text-ink-secondary">Clinicians can sign in to the portal.</p>
          <a href="/login" className="inline-flex min-h-11 items-center underline underline-offset-[3px]">Sign in to the clinician portal</a>
        </div>
      </div>
    </main>
  );
}
