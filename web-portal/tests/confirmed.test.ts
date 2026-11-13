import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

test('confirmation landing is public static guidance without auth, callbacks, or API access', () => {
  const page = read('src/app/confirmed/page.tsx');
  assert.match(page, /Your email is confirmed/);
  assert.match(page, /Return to the UNZIT app and sign in/);
  assert.match(page, /Clinicians can sign in to the portal/);
  assert.match(page, /href="\/login"/);
  assert.doesNotMatch(page, /use client|useAuth|supabase|fetch\(|searchParams|useSearchParams|useEffect|apiService/);
  const boundary = read('src/components/layout/PortalAuthBoundary.tsx');
  assert.match(boundary, /pathname === '\/confirmed'/);
  assert.match(boundary, /lazy\(/);
  assert.match(boundary, /import\('@\/lib\/auth'\)/);
  assert.match(boundary, /return children/);
  assert.doesNotMatch(boundary, /import .*from '@\/lib\/(?:auth|api)'/);
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /<PortalAuthBoundary>/);
  assert.doesNotMatch(layout, /import .*from "@\/lib\/auth"/);
});
