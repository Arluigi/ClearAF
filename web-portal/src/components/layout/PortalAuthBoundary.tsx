'use client';

import { lazy, Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// Keep the informational email landing independent of session initialization,
// including the Supabase client's automatic refresh of a stored session.
const AuthProvider = lazy(() => import('@/lib/auth').then(module => ({ default: module.AuthProvider })));

export default function PortalAuthBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/confirmed') return children;
  return (
    <Suspense fallback={<p role="status" className="p-8">Loading your account…</p>}>
      <AuthProvider>{children}</AuthProvider>
    </Suspense>
  );
}
