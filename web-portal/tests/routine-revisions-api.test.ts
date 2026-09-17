import test from 'node:test';
import assert from 'node:assert/strict';
import './env';
import { apiService, authStorage, supabase } from '../src/lib/api';
import { APIError } from '../src/types/api';
import { loadRevisionHistory } from '../src/lib/routine-care';

test('revision history client targets the bounded clinician endpoint', async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  const getSession = supabase.auth.getSession;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const session = { access_token: 'synthetic-token', user: { id: 'account-a' } };
  authStorage.beginLogin();
  apiService.acceptSession(session);
  supabase.auth.getSession = async () => ({ data: { session }, error: null }) as Awaited<ReturnType<typeof getSession>>;
  globalThis.fetch = async input => {
    requests.push(String(input));
    return new Response(JSON.stringify({ data: [], pagination: { page: 2, limit: 20, total: 0, totalPages: 0 } }), { status: 200 });
  };
  try {
    await apiService.getPatientRoutineRevisions('patient a', 'evening', 2);
    assert.deepEqual(requests.map(url => new URL(url).pathname + new URL(url).search), [
      '/api/routines/patients/patient%20a/revisions?timeOfDay=evening&page=2&limit=20',
    ]);
  } finally {
    supabase.auth.getSession = getSession;
    globalThis.fetch = originalFetch;
  }
});

test('an API without the endpoint reads as unsupported; access and network errors still surface', async () => {
  const page = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  assert.deepEqual(await loadRevisionHistory(async () => page), { status: 'ready', page });
  assert.deepEqual(await loadRevisionHistory(async () => { throw new APIError(404, 'Route not found'); }), { status: 'unsupported' });
  await assert.rejects(loadRevisionHistory(async () => { throw new APIError(404, 'Patient not found', 'NOT_FOUND'); }));
  await assert.rejects(loadRevisionHistory(async () => { throw new TypeError('offline'); }));
});
