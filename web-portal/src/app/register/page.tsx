import AuthShell from '@/components/layout/AuthShell';

export default function RegisterPage() {
  return <AuthShell eyebrow="Clinician portal" title="Practice-provisioned accounts">
    <div className="space-y-4 text-sm">
      <p>Clinician access is provided by your practice administrator after your professional account is verified. Contact your practice to request an account or resolve an access issue.</p>
      <p className="text-ink-secondary">Creating a patient account does not grant access to this portal.</p>
      <a className="underline underline-offset-[3px]" href="/login">Return to sign in</a>
    </div>
  </AuthShell>;
}
