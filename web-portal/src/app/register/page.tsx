import Link from 'next/link';
export default function RegisterPage() {
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="max-w-md space-y-5"><h1 className="text-2xl font-bold">Practice-provisioned accounts</h1><p>Clinician access is provided by your practice administrator after your professional account is verified. Contact your practice to request an account or resolve an access issue.</p><p>Creating a patient account does not grant access to this portal.</p><Link className="underline" href="/login">Return to sign in</Link></section></main>;
}
